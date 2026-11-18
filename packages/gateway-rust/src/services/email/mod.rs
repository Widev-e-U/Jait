// Async implementations expose the existing object-safe mailbox contract.
macro_rules! impl_mailbox_client {
    ($client:ty) => {
        impl $crate::services::email::contracts::MailboxClient for $client {
            type Error = String;
            fn list_messages<'a>(
                &'a self,
                token: &'a str,
                options: ListMessagesOptions,
            ) -> futures_util::future::BoxFuture<'a, Result<Vec<EmailMessageSummary>, String>> {
                Box::pin(<$client>::list_messages(self, token, options))
            }
            fn get_message<'a>(
                &'a self,
                token: &'a str,
                id: &'a str,
            ) -> futures_util::future::BoxFuture<'a, Result<EmailMessageFull, String>> {
                Box::pin(<$client>::get_message(self, token, id))
            }
            fn send_message<'a>(
                &'a self,
                token: &'a str,
                input: SendMessageInput,
            ) -> futures_util::future::BoxFuture<'a, Result<SentMessage, String>> {
                Box::pin(<$client>::send_message(self, token, input))
            }
            fn tag_message<'a>(
                &'a self,
                token: &'a str,
                id: &'a str,
                add: Vec<String>,
                remove: Vec<String>,
            ) -> futures_util::future::BoxFuture<'a, Result<(), String>> {
                Box::pin(<$client>::tag_message(self, token, id, add, remove))
            }
            fn delete_message<'a>(
                &'a self,
                token: &'a str,
                id: &'a str,
            ) -> futures_util::future::BoxFuture<'a, Result<(), String>> {
                Box::pin(<$client>::delete_message(self, token, id))
            }
            fn list_folders<'a>(
                &'a self,
                token: &'a str,
            ) -> futures_util::future::BoxFuture<'a, Result<Vec<EmailFolder>, String>> {
                Box::pin(<$client>::list_folders(self, token))
            }
            fn get_profile_email<'a>(
                &'a self,
                token: &'a str,
            ) -> futures_util::future::BoxFuture<'a, Result<String, String>> {
                Box::pin(<$client>::get_profile_email(self, token))
            }
        }
    };
}
pub(crate) use impl_mailbox_client;
pub mod inline_images;

pub mod oauth;

pub mod remote_images;

pub mod contracts;

pub mod connection;
pub mod gmail;
pub mod imap;
pub mod outlook;
pub mod service;
pub mod transport;
pub use contracts::*;
pub use service::EmailService;

#[cfg(test)]
mod tests;
