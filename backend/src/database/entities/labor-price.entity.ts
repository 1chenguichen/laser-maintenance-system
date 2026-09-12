import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('labor_prices')
export class LaborPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'fault_type', length: 50, unique: true })
  faultType: string;

  @Column({ name: 'labor_fee', type: 'decimal', precision: 10, scale: 2 })
  laborFee: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  description: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
