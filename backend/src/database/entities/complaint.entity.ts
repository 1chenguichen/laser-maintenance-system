import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ComplaintType, ComplaintStatus } from './enums.js';

@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_order_id', nullable: true })
  workOrderId: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ name: 'engineer_id', nullable: true })
  engineerId: string;

  @Column({ name: 'complaint_type', type: 'enum', enum: ComplaintType })
  complaintType: ComplaintType;

  @Column({ nullable: true })
  level: number;

  @Column({ name: 'refund_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  refundAmount: number;

  @Column({
    type: 'enum',
    enum: ComplaintStatus,
    default: ComplaintStatus.PENDING,
  })
  status: ComplaintStatus;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'handler_id', nullable: true })
  handlerId: string;

  @Column({ name: 'handle_result', type: 'text', nullable: true })
  handleResult: string;

  @Column({ name: 'handle_time', nullable: true })
  handleTime: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToOne('WorkOrder', 'complaint', { nullable: true })
  @JoinColumn({ name: 'work_order_id' })
  workOrder: any;

  @ManyToOne('Customer', 'complaints')
  @JoinColumn({ name: 'customer_id' })
  customer: any;

  @ManyToOne('Engineer', 'complaints', { nullable: true })
  @JoinColumn({ name: 'engineer_id' })
  engineer: any;
}
