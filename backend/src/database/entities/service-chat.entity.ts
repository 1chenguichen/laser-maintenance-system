import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChatDirection } from './enums.js';

@Entity('service_chats')
export class ServiceChat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_order_id', nullable: true })
  workOrderId: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ type: 'enum', enum: ChatDirection })
  direction: ChatDirection;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'cs_operator_id', nullable: true })
  csOperatorId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne('WorkOrder', 'serviceChats', { nullable: true })
  @JoinColumn({ name: 'work_order_id' })
  workOrder: any;

  @ManyToOne('Customer', 'serviceChats')
  @JoinColumn({ name: 'customer_id' })
  customer: any;
}
