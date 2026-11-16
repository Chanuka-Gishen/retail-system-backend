import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AnyJwtPayload, AuthenticatedUserContext, MerchantJwtPayload } from '@/common/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET', 'super-secret-jwt-access-key-development-minimum-32-chars'),
    });
  }

  async validate(payload: AnyJwtPayload): Promise<AuthenticatedUserContext> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type: expected access token.');
    }

    if (payload.isPlatformUser) {
      return {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        isPlatformUser: true,
        permissions: ['*'], // SuperAdmin/Platform roles have global access
      };
    }

    const merchant = payload as MerchantJwtPayload;
    return {
      userId: merchant.sub,
      email: merchant.email,
      merchantId: merchant.merchantId,
      role: merchant.role,
      branchIds: merchant.branchIds || [],
      warehouseIds: merchant.warehouseIds || [],
      permissions: merchant.permissions || [],
      isPlatformUser: false,
    };
  }
}
