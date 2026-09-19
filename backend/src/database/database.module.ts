import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'laser_user'),
        password: config.get('DB_PASSWORD', 'laser_pass_2024'),
        database: config.get('DB_DATABASE', 'laser_maintenance'),
        options: {
          statement_timeout: 30000,
        },
        extra: {
          client_encoding: 'UTF8',
        },
        logging: false,
        entityPrefix: '',
        entities: [join(__dirname, 'entities', '*.entity.{js,ts}')],
        synchronize: config.get('NODE_ENV') === 'development',
      }),
    }),
  ],
})
export class DatabaseModule {}
