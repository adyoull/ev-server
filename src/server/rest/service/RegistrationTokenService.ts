import { Action, Entity } from '../../../types/Authorization';
import { HTTPAuthError, HTTPError } from '../../../types/HTTPError';
import { NextFunction, Request, Response } from 'express';
import { OCPPProtocol, OCPPVersion } from '../../../types/ocpp/OCPPServer';

import AppAuthError from '../../../exception/AppAuthError';
import AppError from '../../../exception/AppError';
import Authorizations from '../../../authorization/Authorizations';
import Constants from '../../../utils/Constants';
import Logging from '../../../utils/Logging';
import RegistrationToken from '../../../types/RegistrationToken';
import RegistrationTokenSecurity from './security/RegistrationTokenSecurity';
import RegistrationTokenStorage from '../../../storage/mongodb/RegistrationTokenStorage';
import { ServerAction } from '../../../types/Server';
import SiteAreaStorage from '../../../storage/mongodb/SiteAreaStorage';
import TenantComponents from '../../../types/TenantComponents';
import Utils from '../../../utils/Utils';
import UtilsService from './UtilsService';
import moment from 'moment';

const MODULE_NAME = 'RegistrationTokenService';

export default class RegistrationTokenService {
  static async handleCreateRegistrationToken(action: ServerAction, req: Request, res: Response, next: NextFunction): Promise<void> {
    // Filter
    const filteredRequest = RegistrationTokenSecurity.filterRegistrationTokenCreateRequest(req.body);
    if (Utils.isComponentActiveFromToken(req.user, TenantComponents.ORGANIZATION) && filteredRequest.siteAreaID) {
      // Get the Site Area
      const siteArea = await SiteAreaStorage.getSiteArea(req.user.tenantID, filteredRequest.siteAreaID);
      UtilsService.assertObjectExists(action, siteArea, `Site Area '${filteredRequest.siteAreaID}' does not exist`,
        MODULE_NAME, 'handleCreateRegistrationToken', req.user);
      if (!Authorizations.canCreateRegistrationToken(req.user, siteArea.siteID)) {
        // Not Authorized!
        throw new AppAuthError({
          errorCode: HTTPAuthError.ERROR,
          user: req.user,
          action: Action.CREATE, entity: Entity.TOKEN,
          module: MODULE_NAME, method: 'handleCreateRegistrationToken'
        });
      }
    } else if (!Authorizations.canCreateRegistrationToken(req.user, null)) {
      // Not Authorized!
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.CREATE, entity: Entity.TOKEN,
        module: MODULE_NAME, method: 'handleCreateRegistrationToken'
      });
    }
    if (!filteredRequest.description) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'The description must be provided',
        module: MODULE_NAME, method: 'handleCreateRegistrationToken',
        user: req.user
      });
    }
    const registrationToken: RegistrationToken = {
      siteAreaID: filteredRequest.siteAreaID,
      description: filteredRequest.description,
      expirationDate: filteredRequest.expirationDate ? filteredRequest.expirationDate : moment().add(1, 'month').toDate(),
      createdBy: { id: req.user.id },
      createdOn: new Date()
    };
    const registrationTokenID = await RegistrationTokenStorage.saveRegistrationToken(req.user.tenantID, registrationToken);
    registrationToken.id = registrationTokenID;
    registrationToken.ocpp15SOAPUrl = Utils.buildOCPPServerURL(req.user.tenantID, OCPPVersion.VERSION_15, OCPPProtocol.SOAP, registrationToken.id);
    registrationToken.ocpp16SOAPUrl = Utils.buildOCPPServerURL(req.user.tenantID, OCPPVersion.VERSION_16, OCPPProtocol.SOAP, registrationToken.id);
    registrationToken.ocpp16JSONUrl = Utils.buildOCPPServerURL(req.user.tenantID, OCPPVersion.VERSION_16, OCPPProtocol.JSON, registrationToken.id);
    // Ok
    res.json(RegistrationTokenSecurity.filterRegistrationTokenResponse(registrationToken, req.user));
    next();
  }

  static async handleDeleteRegistrationToken(action: ServerAction, req: Request, res: Response, next: NextFunction): Promise<void> {
    const tokenID = RegistrationTokenSecurity.filterRegistrationTokenByIDRequest(req.query);
    // Check Mandatory fields
    if (!tokenID) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'Registration Token\'s ID must be provided',
        module: MODULE_NAME, method: 'handleDeleteRegistrationToken',
        user: req.user
      });
    }
    // Check auth
    if (!Authorizations.canDeleteRegistrationToken(req.user)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.DELETE, entity: Entity.TOKEN,
        module: MODULE_NAME, method: 'handleDeleteRegistrationToken',
        value: tokenID
      });
    }
    // Check user
    const registrationToken = await RegistrationTokenStorage.getRegistrationToken(req.user.tenantID, tokenID);
    UtilsService.assertObjectExists(action, registrationToken, `Registration Token '${tokenID}' does not exist`,
      MODULE_NAME, 'handleDeleteRegistrationToken', req.user);
    await RegistrationTokenStorage.deleteRegistrationToken(req.user.tenantID, tokenID);
    // Log
    Logging.logSecurityInfo({
      tenantID: req.user.tenantID,
      user: req.user,
      module: MODULE_NAME, method: 'handleDeleteRegistrationToken',
      message: `Registration token with ID '${tokenID}' has been deleted successfully`,
      action: action
    });
    // Ok
    res.json(Constants.REST_RESPONSE_SUCCESS);
    next();
  }

  static async handleRevokeRegistrationToken(action: ServerAction, req: Request, res: Response, next: NextFunction): Promise<void> {
    const tokenID = RegistrationTokenSecurity.filterRegistrationTokenByIDRequest(req.query);
    // Check Mandatory fields
    if (!tokenID) {
      throw new AppError({
        source: Constants.CENTRAL_SERVER,
        errorCode: HTTPError.GENERAL_ERROR,
        message: 'Registration Token\'s ID must be provided',
        module: MODULE_NAME, method: 'handleRevokeRegistrationToken',
        user: req.user
      });
    }
    // Check auth
    if (!Authorizations.canUpdateRegistrationToken(req.user)) {
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.UPDATE, entity: Entity.TOKEN,
        module: MODULE_NAME, method: 'handleRevokeRegistrationToken',
        value: tokenID
      });
    }
    // Check user
    const registrationToken = await RegistrationTokenStorage.getRegistrationToken(req.user.tenantID, tokenID);
    UtilsService.assertObjectExists(action, registrationToken, `Registration Token '${tokenID}' does not exist`,
      MODULE_NAME, 'handleRevokeRegistrationToken', req.user);
    registrationToken.revocationDate = new Date();
    registrationToken.lastChangedBy = { 'id': req.user.id };
    registrationToken.lastChangedOn = new Date();
    await RegistrationTokenStorage.saveRegistrationToken(req.user.tenantID, registrationToken);
    // Log
    Logging.logSecurityInfo({
      tenantID: req.user.tenantID,
      user: req.user,
      module: MODULE_NAME, method: 'handleRevokeRegistrationToken',
      message: `Registration token with ID '${tokenID}' has been revoked successfully`,
      action: action
    });
    // Ok
    res.json(Constants.REST_RESPONSE_SUCCESS);
    next();
  }

  static async handleGetRegistrationTokens(action: ServerAction, req: Request, res: Response, next: NextFunction): Promise<void> {
    // Check auth
    if (!Authorizations.canListRegistrationTokens(req.user)) {
      // Not Authorized!
      throw new AppAuthError({
        errorCode: HTTPAuthError.ERROR,
        user: req.user,
        action: Action.LIST, entity: Entity.TOKENS,
        module: MODULE_NAME, method: 'handleGetRegistrationTokens'
      });
    }
    const filteredRequest = RegistrationTokenSecurity.filterRegistrationTokensRequest(req.query);
    // Get the tokens
    const registrationTokens = await RegistrationTokenStorage.getRegistrationTokens(req.user.tenantID,
      {
        siteAreaID: filteredRequest.siteAreaID,
        siteIDs: Authorizations.getAuthorizedSiteAdminIDs(req.user, null),
      },
      {
        limit: filteredRequest.Limit,
        skip: filteredRequest.Skip,
        sort: filteredRequest.Sort,
        onlyRecordCount: filteredRequest.OnlyRecordCount
      }
    );
    // Build OCPP URL
    registrationTokens.result.forEach((registrationToken) => {
      registrationToken.ocpp15SOAPUrl = Utils.buildOCPPServerURL(req.user.tenantID, OCPPVersion.VERSION_15, OCPPProtocol.SOAP, registrationToken.id);
      registrationToken.ocpp16SOAPUrl = Utils.buildOCPPServerURL(req.user.tenantID, OCPPVersion.VERSION_16, OCPPProtocol.SOAP, registrationToken.id);
      registrationToken.ocpp16JSONUrl = Utils.buildOCPPServerURL(req.user.tenantID, OCPPVersion.VERSION_16, OCPPProtocol.JSON, registrationToken.id);
      return registrationToken;
    });
    // Filter
    RegistrationTokenSecurity.filterRegistrationTokensResponse(registrationTokens, req.user);
    res.json(registrationTokens);
    next();
  }
}
