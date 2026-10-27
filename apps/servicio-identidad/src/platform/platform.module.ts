import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformUsersService } from './platform-users.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformBillingService, PlatformUsersService, PlatformAdminGuard],
})
export class PlatformModule {}
