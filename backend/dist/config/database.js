import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gestion_kpi',
};
// Create connection pool
export const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
// Test connection
export async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Database connected successfully');
        connection.release();
        return true;
    }
    catch (error) {
        console.error('Database connection failed:', error);
        return false;
    }
}
//# sourceMappingURL=database.js.map