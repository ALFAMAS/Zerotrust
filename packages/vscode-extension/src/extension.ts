import * as vscode from "vscode";

const SECRET_PATTERN = /(SECRET|PASSWORD|KEY|TOKEN)\s*=\s*["']?[a-zA-Z0-9+/]{20,}["']?/gi;

export function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection("zeroauth");

  const generateKeys = vscode.commands.registerCommand("zeroauth.generateKeys", () => {
    const terminal = vscode.window.createTerminal("ZeroAuth Keys");
    terminal.sendText("npx @zeroauth/cli keys:generate");
    terminal.show();
  });

  const validateConfig = vscode.commands.registerCommand("zeroauth.validateConfig", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showErrorMessage("No active editor"); return; }
    const text = editor.document.getText();
    const warnings: string[] = [];
    if (!text.includes("mongo_uri")) warnings.push("mongo_uri");
    if (!text.includes("secret_hex")) warnings.push("tokens.secret_hex");
    if (!text.includes("rp_id")) warnings.push("passkeys.rp_id");
    if (warnings.length > 0) {
      vscode.window.showWarningMessage(`ZeroAuth: missing required fields — ${warnings.join(", ")}`);
    } else {
      vscode.window.showInformationMessage("ZeroAuth: config looks good!");
    }
  });

  const openDocs = vscode.commands.registerCommand("zeroauth.openDocs", () => {
    vscode.env.openExternal(vscode.Uri.parse("https://github.com/ALFAMAS/zeroauth#readme"));
  });

  function checkForSecrets(document: vscode.TextDocument) {
    const config = vscode.workspace.getConfiguration("zeroauth");
    if (!config.get("showSecretWarnings")) return;
    const ext = document.fileName;
    if (!ext.endsWith(".zeroauth") && !ext.endsWith(".zeroauthrc") && !ext.endsWith(".env")) return;

    const text = document.getText();
    const diags: vscode.Diagnostic[] = [];
    let match: RegExpExecArray | null;
    SECRET_PATTERN.lastIndex = 0;
    while ((match = SECRET_PATTERN.exec(text)) !== null) {
      const start = document.positionAt(match.index);
      const end = document.positionAt(match.index + match[0].length);
      const d = new vscode.Diagnostic(
        new vscode.Range(start, end),
        "Possible hardcoded secret — use environment variables in production",
        vscode.DiagnosticSeverity.Warning
      );
      d.source = "ZeroAuth";
      diags.push(d);
    }
    diagnostics.set(document.uri, diags);
  }

  context.subscriptions.push(
    generateKeys,
    validateConfig,
    openDocs,
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(checkForSecrets),
    vscode.workspace.onDidChangeTextDocument(e => checkForSecrets(e.document))
  );

  vscode.workspace.textDocuments.forEach(checkForSecrets);
}

export function deactivate() {}
