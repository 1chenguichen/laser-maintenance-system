import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DispatchType } from './enums.js';

@Entity('dispatch_records')
export class DispatchRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_order_id' })
  workOrderId: string;

  @Column({ name: 'engineer_id', nullable: true })
  engineerId: string | null;

  @Column({ name: 'dispatch_type', type: 'enum', enum: DispatchType })
  dispatchType: DispatchType;

  @Column({ name: 'grab_time', type: 'timestamp', nullable: true })
  grabTime: Date | null;

  @Column({ name: 'response_time', default: 0 })
  responseTime: number;

  @Column({ name: 'remark', type: 'varchar', nullable: true })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne('WorkOrder', 'dispatchRecords')
  @JoinColumn({ name: 'work_order_id' })
  workOrder: any;

  @ManyToOne('Engineer', 'dispatchRecords')
  @JoinColumn({ name: 'engineer_id' })
  engineer: any;
}
