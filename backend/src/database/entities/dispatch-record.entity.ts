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

  @Column({ name: 'engineer_id' })
  engineerId: string;

  @Column({ name: 'dispatch_type', type: 'enum', enum: DispatchType })
  dispatchType: DispatchType;

  @Column({ name: 'grab_time', nullable: true })
  grabTime: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne('WorkOrder', 'dispatchRecords')
  @JoinColumn({ name: 'work_order_id' })
  workOrder: any;

  @ManyToOne('Engineer', 'dispatchRecords')
  @JoinColumn({ name: 'engineer_id' })
  engineer: any;
}
