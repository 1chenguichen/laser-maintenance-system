import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';

@Entity('maintenance_records')
export class MaintenanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_order_id' })
  workOrderId: string;

  @Column({ name: 'device_id' })
  deviceId: string;

  @Column({ name: 'parts_fee', type: 'decimal', precision: 10, scale: 2 })
  partsFee: number;

  @Column({ name: 'labor_fee', type: 'decimal', precision: 10, scale: 2 })
  laborFee: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ name: 'commission_rate', type: 'decimal', precision: 3, scale: 2 })
  commissionRate: number;

  @Column({ name: 'commission_amount', type: 'decimal', precision: 10, scale: 2 })
  commissionAmount: number;

  @Column({ name: 'parts_detail', type: 'json', nullable: true })
  partsDetail: { partId: string; name: string; quantity: number; price: number }[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToOne('WorkOrder', 'maintenanceRecord')
  @JoinColumn({ name: 'work_order_id' })
  workOrder: any;

  @ManyToOne('Device', 'maintenanceRecords')
  @JoinColumn({ name: 'device_id' })
  device: any;
}
