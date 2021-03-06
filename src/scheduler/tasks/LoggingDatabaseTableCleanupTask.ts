import { LockEntity } from '../../types/Locking';
import LockingManager from '../../locking/LockingManager';
import Logging from '../../utils/Logging';
import { LoggingDatabaseTableCleanupTaskConfig } from '../../types/TaskConfig';
import LoggingStorage from '../../storage/mongodb/LoggingStorage';
import SchedulerTask from '../SchedulerTask';
import { ServerAction } from '../../types/Server';
import Tenant from '../../types/Tenant';
import moment from 'moment';

const MODULE_NAME = 'LoggingDatabaseTableCleanupTask';

export default class LoggingDatabaseTableCleanupTask extends SchedulerTask {
  async processTenant(tenant: Tenant, config: LoggingDatabaseTableCleanupTaskConfig): Promise<void> {
    // Get the lock
    const logsCleanUpLock = LockingManager.createExclusiveLock(tenant.id, LockEntity.LOGGING, 'cleanup');
    if (await LockingManager.acquire(logsCleanUpLock)) {
      try {
        // Delete date
        const deleteUpToDate = moment().subtract(config.retentionPeriodWeeks, 'w').startOf('week').toDate();
        // Delete
        let result = await LoggingStorage.deleteLogs(tenant.id, deleteUpToDate);
        // Ok?
        if (result.ok === 1) {
          // Ok
          Logging.logSecurityInfo({
            tenantID: tenant.id,
            action: ServerAction.LOGS_CLEANUP,
            module: MODULE_NAME, method: 'run',
            message: `${result.n} Log(s) have been deleted before '${moment(deleteUpToDate).format('DD/MM/YYYY h:mm A')}'`
          });
        } else {
          // Error
          Logging.logError({
            tenantID: tenant.id,
            action: ServerAction.LOGS_CLEANUP,
            module: MODULE_NAME, method: 'run',
            message: `An error occurred when deleting Logs before '${moment(deleteUpToDate).format('DD/MM/YYYY h:mm A')}'`,
            detailedMessages: { result }
          });
        }
        // Delete date
        const securityDeleteUpToDate: Date = moment().subtract(config.securityRetentionPeriodWeeks, 'w').startOf('week').toDate();
        // Delete Security Logs
        result = await LoggingStorage.deleteSecurityLogs(tenant.id, securityDeleteUpToDate);
        // Ok?
        if (result.ok === 1) {
          // Ok
          Logging.logSecurityInfo({
            tenantID: tenant.id,
            action: ServerAction.LOGS_CLEANUP,
            module: MODULE_NAME, method: 'run',
            message: `${result.n} Security Log(s) have been deleted before '${moment(securityDeleteUpToDate).format('DD/MM/YYYY h:mm A')}'`
          });
        } else {
          // Error
          Logging.logSecurityError({
            tenantID: tenant.id,
            action: ServerAction.LOGS_CLEANUP,
            module: MODULE_NAME, method: 'run',
            message: `An error occurred when deleting Security Logs before '${moment(securityDeleteUpToDate).format('DD/MM/YYYY h:mm A')}'`,
            detailedMessages: { result }
          });
        }
      } catch (error) {
        // Log error
        Logging.logActionExceptionMessage(tenant.id, ServerAction.LOGS_CLEANUP, error);
      } finally {
        // Release the lock
        await LockingManager.release(logsCleanUpLock);
      }
    }
  }
}

