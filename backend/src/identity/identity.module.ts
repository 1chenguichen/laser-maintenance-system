import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {IdentityController} from './identity.controller.js';
import {IdentityService} from './identity.service.js';
import {FederationService} from './federation.js';
@Module({imports:[AuthModule],controllers:[IdentityController],providers:[IdentityService,FederationService],exports:[IdentityService,FederationService]})
export class IdentityModule {}
