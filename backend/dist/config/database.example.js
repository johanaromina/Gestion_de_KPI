// Example database configuration
// This file should be replaced with actual database connection setup
export const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gestion_kpi',
};
//# sourceMappingURL=database.example.js.map