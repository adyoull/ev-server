import AppError from '../../../exception/AppError';
import Constants from '../../../utils/Constants';
import { HTTPError } from '../../../types/HTTPError';
import SchemaValidator from './SchemaValidator';
import Tenant from '../../../types/Tenant';
import fs from 'fs';
import global from '../../../types/GlobalType';

export default class TenantValidator extends SchemaValidator {
  private static _instance: TenantValidator | undefined;
  private _tenantCreation: any;
  private _tenantUpdate: any;

  private constructor() {
    super('TenantValidator');
    this._tenantCreation = JSON.parse(fs.readFileSync(`${global.appRoot}/assets/server/rest/schemas/tenant/tenant-create.json`, 'utf8'));
    this._tenantUpdate = JSON.parse(fs.readFileSync(`${global.appRoot}/assets/server/rest/schemas/tenant/tenant-update.json`, 'utf8'));
  }

  public static getInstance(): TenantValidator {
    if (!TenantValidator._instance) {
      TenantValidator._instance = new TenantValidator();
    }
    return TenantValidator._instance;
  }

  public validateTenantCreation(tenant: Tenant): Tenant {
    // Validate schema
    this.validate(this._tenantCreation, tenant);
    // Validate deps between components
    this.validateComponentDependencies(tenant);
    return tenant;
  }

  public validateTenantUpdate(tenant: Tenant): Tenant {
    // Validate schema
    this.validate(this._tenantUpdate, tenant);
    // Validate deps between components
    this.validateComponentDependencies(tenant);
    return tenant;
  }

  private validateComponentDependencies(tenant: Tenant) {
    if (tenant.components) {
      // Smart Charging active: Organization must be active
      if (tenant.components.smartCharging && tenant.components.organization &&
          tenant.components.smartCharging.active && !tenant.components.organization.active) {
        throw new AppError({
          source: Constants.CENTRAL_SERVER,
          errorCode: HTTPError.GENERAL_ERROR,
          message: 'Organization must be active to use the Smart Charging component',
          module: this.moduleName, method: 'validateTenantUpdate'
        });
      }
      // Asset active: Organization must be active
      if (tenant.components.asset && tenant.components.organization &&
        tenant.components.asset.active && !tenant.components.organization.active) {
        throw new AppError({
          source: Constants.CENTRAL_SERVER,
          errorCode: HTTPError.GENERAL_ERROR,
          message: 'Organization must be active to use the Asset component',
          module: this.moduleName, method: 'validateTenantUpdate'
        });
      }
      // Billing active: Pricing must be active
      if (tenant.components.billing && tenant.components.pricing &&
          tenant.components.billing.active && !tenant.components.pricing.active) {
        throw new AppError({
          source: Constants.CENTRAL_SERVER,
          errorCode: HTTPError.GENERAL_ERROR,
          message: 'Pricing must be active to use the Billing component',
          module: this.moduleName, method: 'validateTenantUpdate'
        });
      }
      // Refund active: Pricing must be active
      if (tenant.components.refund && tenant.components.pricing &&
          tenant.components.refund.active && !tenant.components.pricing.active) {
        throw new AppError({
          source: Constants.CENTRAL_SERVER,
          errorCode: HTTPError.GENERAL_ERROR,
          message: 'Pricing must be active to use the Refund component',
          module: this.moduleName, method: 'validateTenantUpdate'
        });
      }
    }
  }
}
