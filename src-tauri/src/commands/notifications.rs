use lettre::message::header::ContentType;
use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::{Message, SmtpTransport, Transport};

#[tauri::command]
pub async fn send_notification_email(
    to: String,
    subject: String,
    body: String,
    smtp_host: String,
    smtp_port: u16,
    smtp_username: String,
    smtp_password: String,
    smtp_from: String,
    smtp_tls: String, // "tls" | "starttls" | "none"
) -> Result<(), String> {
    let from_mailbox: Mailbox = smtp_from
        .parse()
        .map_err(|e| format!("Invalid from address: {e}"))?;
    let to_mailbox: Mailbox = to
        .parse()
        .map_err(|e| format!("Invalid to address: {e}"))?;

    let email = Message::builder()
        .from(from_mailbox)
        .to(to_mailbox)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body)
        .map_err(|e| format!("Failed to build email: {e}"))?;

    let creds = Credentials::new(smtp_username, smtp_password);

    let mailer = match smtp_tls.as_str() {
        "tls" => {
            let tls_params = TlsParameters::new(smtp_host.clone())
                .map_err(|e| format!("TLS error: {e}"))?;
            SmtpTransport::relay(&smtp_host)
                .map_err(|e| format!("SMTP relay error: {e}"))?
                .port(smtp_port)
                .tls(Tls::Wrapper(tls_params))
                .credentials(creds)
                .build()
        }
        "starttls" => {
            let tls_params = TlsParameters::new(smtp_host.clone())
                .map_err(|e| format!("TLS error: {e}"))?;
            SmtpTransport::relay(&smtp_host)
                .map_err(|e| format!("SMTP relay error: {e}"))?
                .port(smtp_port)
                .tls(Tls::Required(tls_params))
                .credentials(creds)
                .build()
        }
        _ => {
            // Unencrypted SMTP — only use on trusted local networks
            SmtpTransport::builder_dangerous(&smtp_host)
                .port(smtp_port)
                .credentials(creds)
                .build()
        }
    };

    mailer
        .send(&email)
        .map_err(|e| format!("Failed to send email: {e}"))?;

    Ok(())
}
