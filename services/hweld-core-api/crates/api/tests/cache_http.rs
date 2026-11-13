//! Regressão do middleware `CacheHttp`: ETag/304, políticas de Cache-Control
//! por contexto (anônimo do portal vs. autenticado) e `Vary: Authorization`.

use actix_web::http::header::{AUTHORIZATION, CACHE_CONTROL, ETAG, IF_NONE_MATCH, VARY};
use actix_web::{test, web, App, HttpResponse};
use hweld_api::cache_http::CacheHttp;

macro_rules! nova_app {
    () => {
        test::init_service(
            App::new()
                .wrap(CacheHttp)
                .route("/api/v1/portal/categorias", web::get().to(|| async {
                    HttpResponse::Ok().json(serde_json::json!([{"id":1,"nome":"X"}]))
                }))
                .route("/api/v1/pedidos", web::get().to(|| async {
                    HttpResponse::Ok().json(serde_json::json!({"itens":[]}))
                }))
                .route("/api/v1/midia/1.png", web::get().to(|| async {
                    HttpResponse::Ok()
                        .insert_header(("Content-Type", "image/png"))
                        .insert_header(("Cache-Control", "public, max-age=31536000, immutable"))
                        .body(vec![1u8, 2, 3])
                })),
        )
        .await
    };
}

#[actix_web::test]
async fn get_json_publico_ganha_etag_e_cache_publico() {
    let app = nova_app!();
    let res = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/portal/categorias")
            .to_request(),
    )
    .await;

    assert_eq!(res.status(), 200);
    assert!(res.headers().contains_key(ETAG));
    assert_eq!(
        res.headers().get(CACHE_CONTROL).unwrap(),
        "public, max-age=15, stale-while-revalidate=45"
    );
    assert!(res
        .headers()
        .get(VARY)
        .unwrap()
        .to_str()
        .unwrap()
        .contains("Authorization"));
}

#[actix_web::test]
async fn if_none_match_igual_retorna_304_sem_corpo() {
    let app = nova_app!();
    let res = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/portal/categorias")
            .to_request(),
    )
    .await;
    let etag = res
        .headers()
        .get(ETAG)
        .unwrap()
        .to_str()
        .unwrap()
        .to_owned();

    let res304 = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/portal/categorias")
            .insert_header((IF_NONE_MATCH, etag.clone()))
            .to_request(),
    )
    .await;
    assert_eq!(res304.status(), 304);
    assert_eq!(res304.headers().get(ETAG).unwrap(), &etag);
    let corpo = test::read_body(res304).await;
    assert!(corpo.is_empty());
}

#[actix_web::test]
async fn get_autenticado_e_privado_e_revalidavel() {
    let app = nova_app!();
    let res = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/pedidos")
            .insert_header((AUTHORIZATION, "Bearer fake"))
            .to_request(),
    )
    .await;
    assert_eq!(
        res.headers().get(CACHE_CONTROL).unwrap(),
        "private, no-cache"
    );
    assert!(res.headers().contains_key(ETAG));
}

#[actix_web::test]
async fn resposta_nao_json_e_policy_propria_passam_intocadas() {
    let app = nova_app!();
    let res = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/midia/1.png")
            .to_request(),
    )
    .await;
    // O handler definiu Cache-Control immutable — middleware não sobrescreve
    // nem adiciona ETag (policy explícita prevalece).
    assert_eq!(
        res.headers().get(CACHE_CONTROL).unwrap(),
        "public, max-age=31536000, immutable"
    );
    assert!(!res.headers().contains_key(ETAG));
}
