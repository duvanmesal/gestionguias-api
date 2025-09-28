// src/libs/jwt.ts
import * as jwt from "jsonwebtoken";
import { env } from "../config/env";

type Rol = "SUPER_ADMIN" | "SUPERVISOR" | "GUIA";

type JwtStdPayload = jwt.JwtPayload;
type Secret = jwt.Secret;
type SignOptions = jwt.SignOptions;

export interface AccessClaims {
  userId: number;
  email: string;
  rol: Rol;
}

export interface RefreshClaims {
  userId: number;
  ver: number;
}

export type JwtPayload = AccessClaims & JwtStdPayload;
export type JwtRefreshPayload = RefreshClaims & JwtStdPayload;

const accessOpts: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as string };
const refreshOpts: SignOptions = { expiresIn: env.JWT_REFRESH_TTL as string };

export const signAccess = (payload: AccessClaims): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET as Secret, accessOpts);

export const verifyAccess = (token: string): JwtPayload =>
  jwt.verify(token, env.JWT_ACCESS_SECRET as Secret) as JwtPayload;

export const signRefresh = (payload: RefreshClaims): string =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET as Secret, refreshOpts);

export const verifyRefresh = (token: string): JwtRefreshPayload =>
  jwt.verify(token, env.JWT_REFRESH_SECRET as Secret) as JwtRefreshPayload;
