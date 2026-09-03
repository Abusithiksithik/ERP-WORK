import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const configuredSecret = process.env.JWT_SECRET?.trim();
if (isProduction && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error('JWT_SECRET must be set to a strong 32+ character value in production');
}
const JWT_SECRET = configuredSecret || 'epft_dev_only_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JwtPayload {
  id: number;
  email: string;
  role: string;
}

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};
