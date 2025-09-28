// src/types/jsonwebtoken-fix.d.ts
// Tipos mínimos y estables para trabajar con jsonwebtoken v9 en TS/NodeNext.
// Evita instalar @types/jsonwebtoken (obsoleto / conflictivo).

declare module "jsonwebtoken" {
  export type StringValue = string | { toString: () => string };
  export type Secret =
    | StringValue
    | Buffer
    | { key: StringValue | Buffer; passphrase: StringValue };

  export interface JwtPayload {
    [key: string]: any;
    iat?: number;
    exp?: number;
    nbf?: number;
    aud?: string | string[];
    iss?: string;
    sub?: string;
    jti?: string;
  }

  export interface SignOptions {
    algorithm?:
      | "HS256"
      | "HS384"
      | "HS512"
      | "RS256"
      | "RS384"
      | "RS512"
      | "ES256"
      | "ES384"
      | "ES512"
      | "PS256"
      | "PS384"
      | "PS512"
      | "none";
    expiresIn?: string | number;
    notBefore?: string | number;
    audience?: string | string[];
    issuer?: string;
    subject?: string;
    jwtid?: string;
    header?: Record<string, any>;
    keyid?: string;
    mutatePayload?: boolean;
    noTimestamp?: boolean;
  }

  export function sign(
    payload: string | Buffer | object,
    secretOrPrivateKey: Secret,
    options?: SignOptions
  ): string;

  export function verify<T = JwtPayload>(
    token: string,
    secretOrPublicKey: Secret
  ): T;

  const _default: {
    sign: typeof sign;
    verify: typeof verify;
  };

  export default _default;
}
