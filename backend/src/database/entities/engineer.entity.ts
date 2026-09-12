import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { EngineerStatus } from './enums.js';

@Entity('engineers')
export class Engineer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 20, unique: true })
  phone: string;

  @Column({ name: 'avatar_url', length: 255, nullable: true })
  avatarUrl: string;

  @Column({
    type: 'enum',
    enum: EngineerStatus,
    default: EngineerStatus.OFFLINE,
  })
  status: EngineerStatus;

  @Column({ name: 'monthly_orders', default: 0 })
  monthlyOrders: number;

  @Column({ name: 'monthly_revenue', type: 'decimal', precision: 10, scale: 2, default: 0 })
  monthlyRevenue: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  rating: number;

  @Column({ name: 'total_orders', default: 0 })
  totalOrders: number;

  @Column({ name: 'total_revenue', type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalRevenue: number;

  @Column({ name: 'joined_at', type: 'date' })
  joinedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany('WorkOrder', 'engineer')
  workOrders: any[];

  @OneToMany('Review', 'engineer')
  reviews: any[];

  @OneToMany('Complaint', 'engineer')
  complaints: any[];

  @OneToMany('DispatchRecord', 'engineer')
  dispatchRecords: any[];
}
