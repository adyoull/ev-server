import AbstractOCPIService, { TenantIdHoldingRequest } from './AbstractOCPIService';
import { Application, NextFunction, Request, Response } from 'express';

import CPOService from './ocpi-services-impl/ocpi-2.1.1/CPOService';
import { Configuration } from '../../types/configuration/Configuration';
import EMSPService from './ocpi-services-impl/ocpi-2.1.1/EMSPService';
import ExpressTools from '../ExpressTools';
import OCPIServices from './OCPIServices';

const MODULE_NAME = 'OCPIServer';

export default class OCPIServer {
  private ocpiRestConfig: Configuration['OCPIService'];
  private expressApplication: Application;

  // Create the rest server
  constructor(ocpiRestConfig: Configuration['OCPIService']) {
    // Keep params
    this.ocpiRestConfig = ocpiRestConfig;
    // Initialize express app
    this.expressApplication = ExpressTools.initApplication();
    // New OCPI Services Instances
    const ocpiServices = new OCPIServices(this.ocpiRestConfig);
    // OCPI versions
    this.expressApplication.use(CPOService.PATH + AbstractOCPIService.VERSIONS_PATH,
      (req: Request, res: Response, next: NextFunction) => ocpiServices.getCPOVersions(req, res, next));
    this.expressApplication.use(EMSPService.PATH + AbstractOCPIService.VERSIONS_PATH,
      (req: Request, res: Response, next: NextFunction) => ocpiServices.getEMSPVersions(req, res, next));
    // Register all services in express
    ocpiServices.getOCPIServiceImplementations().forEach((ocpiService) => {
      this.expressApplication.use(ocpiService.getPath(), async (req: TenantIdHoldingRequest, res: Response, next: NextFunction) => {
        try {
          await ocpiService.restService(req, res, next);
        } catch (error) {
          next(error);
        }
      });
    });
    // Post init
    ExpressTools.postInitApplication(this.expressApplication);
  }

  // Start the server
  start(): void {
    ExpressTools.startServer(this.ocpiRestConfig, ExpressTools.createHttpServer(this.ocpiRestConfig, this.expressApplication), 'OCPI', MODULE_NAME);
  }
}

