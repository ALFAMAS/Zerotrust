import { DEFAULT_LOCALE, type Locale, normalizeLocale } from "../../shared/locale";

/**
 * Localized copy for transactional emails. English is the source of truth and
 * the fallback for any missing key/locale, so partially-translated locales
 * degrade gracefully rather than render blanks.
 *
 * Covers all transactional templates: welcome, verify, magic-link, password-reset,
 * security-alert, billing-event, notification, otp.
 */
type Dict = Record<string, string>;

const en: Dict = {
  // ── Welcome ──
  welcome_subject: "Welcome to {appName}!",
  welcome_heading: "Welcome, {name}!",
  welcome_p1: "Your account has been created successfully. We're thrilled to have you on board.",
  welcome_p2:
    "You can now sign in to your account and start exploring everything {appName} has to offer.",
  welcome_cta: "Sign in to your account",
  welcome_link_help:
    "If the button above doesn't work, copy and paste this link into your browser:",
  welcome_footer_registered: "You received this email because you registered at {appName}.",
  welcome_footer_ignore: "If you didn't create an account, you can safely ignore this email.",
  welcome_team: "— The {appName} Team",

  // ── Verify email ──
  verify_subject: "Verify your email — {appName}",
  verify_heading: "Confirm your email, {name}",
  verify_p1:
    "Thanks for signing up. Verify your email address to secure your account. You can either tap the button below or enter the code manually. This link and code expire in {minutes} minutes.",
  verify_cta: "Verify email",
  verify_or_code: "Or enter this code:",
  verify_link_help: "If the button doesn't work, paste this link into your browser:",
  verify_ignore: "If you didn't create a {appName} account, you can safely ignore this email.",

  // ── Magic link ──
  magiclink_subject: "Your sign-in link for {appName}",
  magiclink_heading: "Hi, {name}!",
  magiclink_p1: "You requested a sign-in link for your {appName} account. Click the button below to sign in instantly.",
  magiclink_p2: "This link expires in {minutes} minutes and can only be used once.",
  magiclink_cta: "Sign In Now",
  magiclink_link_help: "If the button above doesn't work, copy and paste this link into your browser:",
  magiclink_ignore: "If you didn't request this, you can safely ignore this email.",
  magiclink_footer: "You received this email because a sign-in was requested at {appName}.",
  magiclink_valid: "This link is valid for {minutes} minutes.",
  magiclink_team: "— The {appName} Team",

  // ── Password reset ──
  reset_subject: "Reset your {appName} password",
  reset_heading: "Password Reset Request",
  reset_p1: "Hi {name}, we received a request to reset the password for your {appName} account.",
  reset_p2: "Click the button below to set a new password. This link expires in {minutes} minutes.",
  reset_cta: "Reset Password",
  reset_link_help: "If the button above doesn't work, copy and paste this link into your browser:",
  reset_security: "If you didn't request a password reset, please secure your account immediately by changing your password and reviewing your active sessions.",
  reset_footer: "You received this email because a password reset was requested at {appName}.",
  reset_valid: "This link is valid for {minutes} minutes.",
  reset_team: "— The {appName} Team",

  // ── Security alert ──
  alert_subject: "Security alert: {action} on your {appName} account",
  alert_heading: "Security Alert",
  alert_p1: "Hi {name}, we detected the following activity on your {appName} account:",
  alert_activity: "Activity",
  alert_device: "Device",
  alert_location: "Location",
  alert_time: "Time",
  alert_warning: "If this wasn't you, your account may be compromised. Click \"Secure My Account\" immediately to revoke access and change your password.",
  alert_secure_cta: "Secure My Account",
  alert_wasme_cta: "This was me",
  alert_footer: "This security alert was sent from {appName}.",
  alert_support: "If you believe this is an error, contact our support team.",

  // ── Billing event ──
  billing_team: "— The {appName} Team",

  // ── OTP ──
  otp_subject: "Your {appName} verification code",
  otp_heading: "Your verification code",
  otp_p1: "Hi {name}, use the following code to verify your identity. This code expires in {minutes} minutes.",
  otp_code_label: "Verification code:",
  otp_ignore: "If you didn't request this code, you can safely ignore this email.",
  otp_footer: "You received this email because a verification was requested at {appName}.",
  otp_valid: "This code is valid for {minutes} minutes.",
  otp_team: "— The {appName} Team",

  // ── Notification ──
  notification_link: "View details",
  notification_unsubscribe: "Unsubscribe",
  notification_footer: "You received this email because of your notification preferences at {appName}.",
};

const es: Dict = {
  welcome_subject: "¡Bienvenido a {appName}!",
  welcome_heading: "¡Bienvenido, {name}!",
  welcome_p1: "Tu cuenta se ha creado correctamente. Nos alegra mucho tenerte con nosotros.",
  welcome_p2:
    "Ya puedes iniciar sesión en tu cuenta y empezar a explorar todo lo que {appName} ofrece.",
  welcome_cta: "Inicia sesión en tu cuenta",
  welcome_link_help: "Si el botón no funciona, copia y pega este enlace en tu navegador:",
  welcome_footer_registered: "Recibiste este correo porque te registraste en {appName}.",
  welcome_footer_ignore: "Si no creaste una cuenta, puedes ignorar este correo de forma segura.",
  welcome_team: "— El equipo de {appName}",
  verify_subject: "Verifica tu correo — {appName}",
  verify_heading: "Confirma tu correo, {name}",
  verify_p1:
    "Gracias por registrarte. Verifica tu dirección de correo para proteger tu cuenta. Puedes tocar el botón de abajo o introducir el código manualmente. Este enlace y código caducan en {minutes} minutos.",
  verify_cta: "Verificar correo",
  verify_or_code: "O introduce este código:",
  verify_link_help: "Si el botón no funciona, pega este enlace en tu navegador:",
  verify_ignore:
    "Si no creaste una cuenta en {appName}, puedes ignorar este correo de forma segura.",
  magiclink_subject: "Tu enlace de inicio de sesión para {appName}",
  magiclink_heading: "¡Hola, {name}!",
  magiclink_p1: "Solicitaste un enlace de inicio de sesión para tu cuenta de {appName}. Haz clic en el botón para iniciar sesión al instante.",
  magiclink_p2: "Este enlace caduca en {minutes} minutos y solo se puede usar una vez.",
  magiclink_cta: "Iniciar sesión",
  magiclink_link_help: "Si el botón no funciona, copia y pega este enlace en tu navegador:",
  magiclink_ignore: "Si no solicitaste esto, puedes ignorar este correo de forma segura.",
  magiclink_footer: "Recibiste este correo porque se solicitó un inicio de sesión en {appName}.",
  magiclink_valid: "Este enlace es válido durante {minutes} minutos.",
  magiclink_team: "— El equipo de {appName}",
  reset_subject: "Restablece tu contraseña de {appName}",
  reset_heading: "Solicitud de restablecimiento de contraseña",
  reset_p1: "Hola {name}, recibimos una solicitud para restablecer la contraseña de tu cuenta de {appName}.",
  reset_p2: "Haz clic en el botón para establecer una nueva contraseña. Este enlace caduca en {minutes} minutos.",
  reset_cta: "Restablecer contraseña",
  reset_link_help: "Si el botón no funciona, copia y pega este enlace en tu navegador:",
  reset_security: "Si no solicitaste un restablecimiento, protege tu cuenta inmediatamente.",
  reset_footer: "Recibiste este correo porque se solicitó un restablecimiento en {appName}.",
  reset_valid: "Este enlace es válido durante {minutes} minutos.",
  reset_team: "— El equipo de {appName}",
  alert_subject: "Alerta de seguridad: {action} en tu cuenta de {appName}",
  alert_heading: "Alerta de seguridad",
  alert_p1: "Hola {name}, detectamos la siguiente actividad en tu cuenta de {appName}:",
  alert_activity: "Actividad",
  alert_device: "Dispositivo",
  alert_location: "Ubicación",
  alert_time: "Hora",
  alert_warning: "Si no fuiste tú, tu cuenta puede estar comprometida. Haz clic en \"Proteger mi cuenta\" inmediatamente.",
  alert_secure_cta: "Proteger mi cuenta",
  alert_wasme_cta: "Fui yo",
  alert_footer: "Esta alerta de seguridad fue enviada desde {appName}.",
  alert_support: "Si crees que es un error, contacta a nuestro equipo de soporte.",
  otp_subject: "Tu código de verificación de {appName}",
  otp_heading: "Tu código de verificación",
  otp_p1: "Hola {name}, usa el siguiente código para verificar tu identidad. Este código caduca en {minutes} minutos.",
  otp_code_label: "Código de verificación:",
  otp_ignore: "Si no solicitaste este código, puedes ignorar este correo de forma segura.",
  otp_footer: "Recibiste este correo porque se solicitó una verificación en {appName}.",
  otp_valid: "Este código es válido durante {minutes} minutos.",
  otp_team: "— El equipo de {appName}",
  notification_link: "Ver detalles",
  notification_unsubscribe: "Cancelar suscripción",
  notification_footer: "Recibiste este correo por tus preferencias de notificación en {appName}.",
};

const fr: Dict = {
  welcome_subject: "Bienvenue sur {appName} !",
  welcome_heading: "Bienvenue, {name} !",
  welcome_p1: "Votre compte a été créé avec succès. Nous sommes ravis de vous compter parmi nous.",
  welcome_p2:
    "Vous pouvez maintenant vous connecter à votre compte et découvrir tout ce que {appName} propose.",
  welcome_cta: "Connectez-vous à votre compte",
  welcome_link_help:
    "Si le bouton ci-dessus ne fonctionne pas, copiez ce lien dans votre navigateur :",
  welcome_footer_registered: "Vous recevez cet e-mail car vous vous êtes inscrit sur {appName}.",
  welcome_footer_ignore:
    "Si vous n'avez pas créé de compte, vous pouvez ignorer cet e-mail en toute sécurité.",
  welcome_team: "— L'équipe {appName}",
  verify_subject: "Vérifiez votre e-mail — {appName}",
  verify_heading: "Confirmez votre e-mail, {name}",
  verify_p1:
    "Merci de votre inscription. Vérifiez votre adresse e-mail pour sécuriser votre compte. Vous pouvez appuyer sur le bouton ci-dessous ou saisir le code manuellement. Ce lien et ce code expirent dans {minutes} minutes.",
  verify_cta: "Vérifier l'e-mail",
  verify_or_code: "Ou saisissez ce code :",
  verify_link_help: "Si le bouton ne fonctionne pas, collez ce lien dans votre navigateur :",
  verify_ignore:
    "Si vous n'avez pas créé de compte {appName}, vous pouvez ignorer cet e-mail en toute sécurité.",
  magiclink_subject: "Votre lien de connexion pour {appName}",
  magiclink_heading: "Bonjour, {name} !",
  magiclink_p1: "Vous avez demandé un lien de connexion pour votre compte {appName}. Cliquez sur le bouton pour vous connecter instantanément.",
  magiclink_p2: "Ce lien expire dans {minutes} minutes et ne peut être utilisé qu'une seule fois.",
  magiclink_cta: "Se connecter",
  magiclink_link_help: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
  magiclink_ignore: "Si vous n'avez pas demandé ceci, vous pouvez ignorer cet e-mail en toute sécurité.",
  magiclink_footer: "Vous recevez cet e-mail car une connexion a été demandée sur {appName}.",
  magiclink_valid: "Ce lien est valable pendant {minutes} minutes.",
  magiclink_team: "— L'équipe {appName}",
  reset_subject: "Réinitialisez votre mot de passe {appName}",
  reset_heading: "Demande de réinitialisation de mot de passe",
  reset_p1: "Bonjour {name}, nous avons reçu une demande de réinitialisation du mot de passe de votre compte {appName}.",
  reset_p2: "Cliquez sur le bouton pour définir un nouveau mot de passe. Ce lien expire dans {minutes} minutes.",
  reset_cta: "Réinitialiser le mot de passe",
  reset_link_help: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
  reset_security: "Si vous n'avez pas demandé de réinitialisation, sécurisez votre compte immédiatement.",
  reset_footer: "Vous recevez cet e-mail car une réinitialisation a été demandée sur {appName}.",
  reset_valid: "Ce lien est valable pendant {minutes} minutes.",
  reset_team: "— L'équipe {appName}",
  alert_subject: "Alerte de sécurité : {action} sur votre compte {appName}",
  alert_heading: "Alerte de sécurité",
  alert_p1: "Bonjour {name}, nous avons détecté l'activité suivante sur votre compte {appName} :",
  alert_activity: "Activité",
  alert_device: "Appareil",
  alert_location: "Emplacement",
  alert_time: "Heure",
  alert_warning: "Si ce n'était pas vous, votre compte peut être compromis. Cliquez sur \"Sécuriser mon compte\" immédiatement.",
  alert_secure_cta: "Sécuriser mon compte",
  alert_wasme_cta: "C'était moi",
  alert_footer: "Cette alerte de sécurité a été envoyée depuis {appName}.",
  alert_support: "Si vous pensez qu'il s'agit d'une erreur, contactez notre équipe de support.",
  otp_subject: "Votre code de vérification {appName}",
  otp_heading: "Votre code de vérification",
  otp_p1: "Bonjour {name}, utilisez le code suivant pour vérifier votre identité. Ce code expire dans {minutes} minutes.",
  otp_code_label: "Code de vérification :",
  otp_ignore: "Si vous n'avez pas demandé ce code, vous pouvez ignorer cet e-mail en toute sécurité.",
  otp_footer: "Vous recevez cet e-mail car une vérification a été demandée sur {appName}.",
  otp_valid: "Ce code est valable pendant {minutes} minutes.",
  otp_team: "— L'équipe {appName}",
  notification_link: "Voir les détails",
  notification_unsubscribe: "Se désabonner",
  notification_footer: "Vous recevez cet e-mail en raison de vos préférences de notification sur {appName}.",
};

const DICTS: Record<Locale, Dict> = { en, es, fr };

/** Translate a key for a locale, interpolating `{var}` placeholders. */
export function tr(
  locale: Locale | string | undefined,
  key: string,
  vars: Record<string, string | number> = {}
): string {
  const loc = normalizeLocale(locale);
  const template = DICTS[loc]?.[key] ?? DICTS[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}

/** `lang=""` attribute value for the email's <html> root. */
export function htmlLang(locale: Locale | string | undefined): Locale {
  return normalizeLocale(locale);
}
