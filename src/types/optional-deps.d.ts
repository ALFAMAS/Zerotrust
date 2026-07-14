/** Ambient types for optional dependencies (not required at install time). */
declare module "pkcs11js" {
  export const CKM_AES_GCM: number;
  export const CKM_AES_KEY_GEN: number;
  export const CKM_GENERIC_SECRET_KEY_GEN: number;
  export const CK_PARAMS_GCM: number;

  type Handle = Buffer;
  type Attribute = { type: number; value?: number | boolean | string | Buffer | Date };
  type Mechanism = { mechanism: number; parameter?: Buffer | number | Record<string, unknown> };

  export class PKCS11 {
    load(path: string): void;
    C_Initialize(): void;
    C_Finalize(): void;
    C_GetSlotList(tokenPresent: boolean): Handle[];
    C_OpenSession(slot: Handle, flags: number): Handle;
    C_CloseSession(session: Handle): void;
    C_Login(session: Handle, userType: number, pin: string): void;
    C_GenerateKey(session: Handle, mechanism: Mechanism, template: Attribute[]): Handle;
    C_DestroyObject(session: Handle, handle: Handle): void;
    C_FindObjectsInit(session: Handle, template: Attribute[]): void;
    C_FindObjects(session: Handle, max: number): Handle[];
    C_FindObjectsFinal(session: Handle): void;
    C_GetAttributeValue(session: Handle, handle: Handle, template: Attribute[]): Attribute[];
    C_SignInit(session: Handle, mechanism: Mechanism, key: Handle): void;
    C_Sign(session: Handle, data: Buffer, signature: Buffer): Buffer;
    C_EncryptInit(session: Handle, mechanism: Mechanism, key: Handle): void;
    C_Encrypt(session: Handle, data: Buffer, encrypted: Buffer): Buffer;
    C_DecryptInit(session: Handle, mechanism: Mechanism, key: Handle): void;
    C_Decrypt(session: Handle, data: Buffer, plain: Buffer): Buffer;
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
