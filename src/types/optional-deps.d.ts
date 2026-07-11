/** Ambient types for optional dependencies (not required at install time). */
declare module "pkcs11js" {
  export class PKCS11 {
    load(path: string): void;
    C_Initialize(): void;
    C_Finalize(): void;
    C_GetSlotList(tokenPresent: boolean): number[];
    C_OpenSession(slot: number, flags: number): unknown;
    C_CloseSession(session: unknown): void;
    C_Login(session: unknown, userType: number, pin: string): void;
    C_CreateObject(session: unknown, template: unknown[]): unknown;
    C_DestroyObject(session: unknown, handle: unknown): void;
    C_FindObjectsInit(session: unknown, template: unknown[]): void;
    C_FindObjects(session: unknown, max: number): unknown[];
    C_FindObjectsFinal(session: unknown): void;
    C_GetAttributeValue(session: unknown, handle: unknown, template: unknown[]): unknown[];
    C_SignInit(session: unknown, mechanism: unknown, key: unknown): void;
    C_Sign(session: unknown, data: Buffer, signature: Buffer): Buffer;
    C_EncryptInit(session: unknown, mechanism: unknown, key: unknown): void;
    C_Encrypt(session: unknown, data: Buffer, encrypted: Buffer): Buffer;
    C_DecryptInit(session: unknown, mechanism: unknown, key: unknown): void;
    C_Decrypt(session: unknown, data: Buffer, plain: Buffer): Buffer;
  }
}

declare module "@aws-sdk/client-secrets-manager" {
  export class SecretsManagerClient {
    constructor(config: { region: string });
    send(command: unknown): Promise<{ SecretString?: string }>;
  }
  export class GetSecretValueCommand {
    constructor(input: { SecretId: string });
  }
}
