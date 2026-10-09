import { getTestDatabaseUrl } from './test-database-url';

// Anything that reads DATABASE_URL during integration tests must hit the test database.
process.env.DATABASE_URL = getTestDatabaseUrl();
