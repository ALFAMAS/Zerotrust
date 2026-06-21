import { DEFAULT_LOCALE, type Locale, normalizeLocale } from "../../shared/locale";

/**
 * Localized copy for transactional emails. English is the source of truth and
 * the fallback for any missing key/locale, so partially-translated locales
 * degrade gracefully rather than render blanks.
 *
 * Currently covers the registration emails (welcome + verify). Other templates
 * can adopt the same `tr()` mechanism incrementally — add their keys here.
 */
type Dict = Record<string, string>;

const en: Dict = {
  // Welcome
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
  // Verify email
  verify_subject: "Verify your email — {appName}",
  verify_heading: "Confirm your email, {name}",
  verify_p1:
    "Thanks for signing up. Verify your email address to secure your account. You can either tap the button below or enter the code manually. This link and code expire in {minutes} minutes.",
  verify_cta: "Verify email",
  verify_or_code: "Or enter this code:",
  verify_link_help: "If the button doesn't work, paste this link into your browser:",
  verify_ignore: "If you didn't create a {appName} account, you can safely ignore this email.",
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
