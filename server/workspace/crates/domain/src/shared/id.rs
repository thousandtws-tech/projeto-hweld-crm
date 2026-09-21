//! Identificadores fortemente tipados por agregado — `Id<Empresa>` ≠ `Id<Pedido>`
//! em tempo de compilação, com zero custo em runtime (newtype sobre `i64`).

use core::fmt;
use core::marker::PhantomData;
use serde::Serializer;

#[derive(Debug)]
pub struct Id<T> {
    valor: i64,
    _agregado: PhantomData<fn() -> T>,
}

impl<T> Id<T> {
    pub fn novo(valor: i64) -> Self {
        Self {
            valor,
            _agregado: PhantomData,
        }
    }

    pub fn valor(self) -> i64 {
        self.valor
    }
}

impl<T> Copy for Id<T> {}
impl<T> Clone for Id<T> {
    fn clone(&self) -> Self {
        *self
    }
}
impl<T> PartialEq for Id<T> {
    fn eq(&self, outro: &Self) -> bool {
        self.valor == outro.valor
    }
}
impl<T> Eq for Id<T> {}
impl<T> PartialOrd for Id<T> {
    fn partial_cmp(&self, outro: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(outro))
    }
}
impl<T> Ord for Id<T> {
    fn cmp(&self, outro: &Self) -> core::cmp::Ordering {
        self.valor.cmp(&outro.valor)
    }
}
impl<T> core::hash::Hash for Id<T> {
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        self.valor.hash(state);
    }
}

impl<T> fmt::Display for Id<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.valor)
    }
}

impl<T> From<Id<T>> for i64 {
    fn from(id: Id<T>) -> i64 {
        id.valor
    }
}

impl<T> serde::Serialize for Id<T> {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_i64(self.valor)
    }
}

impl<T> utoipa::__dev::ComposeSchema for Id<T> {
    fn compose(
        _: Vec<utoipa::openapi::RefOr<utoipa::openapi::schema::Schema>>,
    ) -> utoipa::openapi::RefOr<utoipa::openapi::schema::Schema> {
        utoipa::openapi::schema::Object::builder()
            .schema_type(utoipa::openapi::schema::Type::Integer)
            .format(Some(utoipa::openapi::schema::SchemaFormat::KnownFormat(
                utoipa::openapi::schema::KnownFormat::Int64,
            )))
            .into()
    }
}

impl<T> utoipa::ToSchema for Id<T> {}
