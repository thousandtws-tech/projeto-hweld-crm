use actix_cors::Cors;
use actix_web::{
    middleware::{Compress, DefaultHeaders},
    test, web, App,
};

#[actix_web::test]
async fn swagger_ui_serve_index() {
    // Reproduz o App de produção: mesmos middlewares + PayloadConfig + configure.
    let app = test::init_service(
        App::new()
            .app_data(web::PayloadConfig::new(10 * 1024 * 1024))
            .wrap(
                Cors::default()
                    .allowed_methods(vec!["GET", "POST", "PUT", "PATCH", "DELETE"])
                    .max_age(3600),
            )
            .wrap(
                DefaultHeaders::new()
                    .add(("X-Content-Type-Options", "nosniff"))
                    .add(("X-Frame-Options", "DENY"))
                    .add(("Referrer-Policy", "strict-origin-when-cross-origin"))
                    .add((
                        "Content-Security-Policy",
                        "default-src 'self'; script-src 'self' 'unsafe-inline'; \
                         style-src 'self' 'unsafe-inline'; img-src 'self' data:; \
                         frame-ancestors 'none'",
                    )),
            )
            .wrap(Compress::default())
            .wrap(tracing_actix_web::TracingLogger::default())
            .configure(|cfg| hweld_api::rotas::configurar(cfg, true)),
    )
    .await;

    for uri in [
        "/swagger-ui/",
        "/swagger-ui/index.html",
        "/api-docs/openapi.json",
    ] {
        let resp = test::call_service(&app, test::TestRequest::get().uri(uri).to_request()).await;
        println!("{uri} -> {}", resp.status());
        assert!(
            resp.status().is_success(),
            "{uri} falhou: {}",
            resp.status()
        );
    }
}

#[actix_web::test]
async fn swagger_ui_em_socket_real() {
    // HttpServer real num socket — elimina qualquer diferença do init_service.
    let srv = actix_web::HttpServer::new(|| {
        App::new()
            .wrap(Compress::default())
            .configure(|cfg| hweld_api::rotas::configurar(cfg, true))
    })
    .bind(("127.0.0.1", 18099))
    .unwrap()
    .run();
    let handle = srv.handle();
    actix_web::rt::spawn(srv);
    actix_web::rt::time::sleep(std::time::Duration::from_millis(300)).await;

    let resp = awc::Client::default()
        .get("http://127.0.0.1:18099/swagger-ui/")
        .send()
        .await
        .unwrap();
    println!("socket real /swagger-ui/ -> {}", resp.status());
    handle.stop(false).await;
    assert!(resp.status().is_success(), "falhou: {}", resp.status());
}
