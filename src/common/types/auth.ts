import { PlatformUserRole, MerchantUserRole } from './enums';

export interface PlatformJwtPayload {
  sub: string; // platform_user_id
  email: string;
  role: PlatformUserRole;
  isPlatformUser: true;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface MerchantJwtPayload {
  sub: string; // merchant_user_id
  merchantId: string; // active merchant context
  email: string;
  role: MerchantUserRole;
  branchIds?: string[]; // assigned branch IDs (empty if all/admin)
  warehouseIds?: string[]; // assigned warehouse IDs
  permissions: string[]; // <module>.<resource>.<action>
  isPlatformUser: false;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export type AnyJwtPayload = PlatformJwtPayload | MerchantJwtPayload;

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  isPlatformUser: boolean;
  merchantId?: string;
  role: PlatformUserRole | MerchantUserRole;
  branchIds?: string[];
  warehouseIds?: string[];
  permissions: string[];
}
