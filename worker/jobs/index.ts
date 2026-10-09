import type { JobDefinition } from '../job-definition';
import { heartbeatJob } from './heartbeat';

/** Every job the worker runs. Add new jobs here. */
export const ALL_JOBS: readonly JobDefinition[] = [heartbeatJob];
