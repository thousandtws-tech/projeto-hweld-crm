#[macro_export]
macro_rules! enum_str {
    (
        $(#[$meta:meta])*
        pub enum $nome:ident {
            $( $(#[$vmeta:meta])* $variante:ident = $texto:literal ),+ $(,)?
        }
    ) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        pub enum $nome {
            $( $(#[$vmeta])* $variante ),+
        }

        impl $nome {
            pub fn as_str(self) -> &'static str {
                match self {
                    $( Self::$variante => $texto ),+
                }
            }

            pub fn todas() -> &'static [Self] {
                &[$( Self::$variante ),+]
            }
        }

        impl ::core::str::FromStr for $nome {
            type Err = $crate::shared::erro::ErroDominio;

            fn from_str(s: &str) -> ::core::result::Result<Self, Self::Err> {
                match s {
                    $( $texto => ::core::result::Result::Ok(Self::$variante), )+
                    _ => ::core::result::Result::Err(
                        $crate::shared::erro::ErroDominio::valor_invalido(
                            stringify!($nome),
                            ::std::format!("valor desconhecido: '{s}'"),
                        ),
                    ),
                }
            }
        }

        impl ::core::convert::TryFrom<&str> for $nome {
            type Error = $crate::shared::erro::ErroDominio;
            fn try_from(s: &str) -> ::core::result::Result<Self, Self::Error> {
                s.parse()
            }
        }

        impl ::core::fmt::Display for $nome {
            fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                f.write_str(self.as_str())
            }
        }

        impl ::serde::Serialize for $nome {
            fn serialize<S: ::serde::Serializer>(&self, s: S) -> ::core::result::Result<S::Ok, S::Error> {
                s.collect_str(self)
            }
        }

        impl<'de> ::serde::Deserialize<'de> for $nome {
            fn deserialize<D: ::serde::Deserializer<'de>>(d: D) -> ::core::result::Result<Self, D::Error> {
                let s = <::std::borrow::Cow<'_, str> as ::serde::Deserialize>::deserialize(d)?;
                s.parse().map_err(::serde::de::Error::custom)
            }
        }

        impl ::utoipa::__dev::ComposeSchema for $nome {
            fn compose(
                _: ::std::vec::Vec<::utoipa::openapi::RefOr<::utoipa::openapi::schema::Schema>>,
            ) -> ::utoipa::openapi::RefOr<::utoipa::openapi::schema::Schema> {
                ::utoipa::openapi::schema::Object::builder()
                    .schema_type(::utoipa::openapi::schema::Type::String)
                    .enum_values(::core::option::Option::Some([$( $texto ),+]))
                    .into()
            }
        }

        impl ::utoipa::ToSchema for $nome {}
    };
}
