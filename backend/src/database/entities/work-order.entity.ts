import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { WorkOrderStatus, DispatchType } from './enums.js';

@Entity('work_orders')
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_no', unique: true, length: 20 })
  orderNo: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ name: 'device_id' })
  deviceId: string;

  @Column({ name: 'engineer_id', nullable: true })
  engineerId: string;

  @Column({ name: 'address_id' })
  addressId: string;

  @Column({ name: 'fault_type', length: 50 })
  faultType: string;

  @Column({ name: 'fault_description', type: 'text', nullable: true })
  faultDescription: string;

  @Column({ name: 'fault_photos', type: 'json', nullable: true })
  faultPhotos: string[];

  @Column({ name: 'emergency_level', default: 1 })
  emergencyLevel: number;

  @Column({
    type: 'enum',
    enum: WorkOrderStatus,
    default: WorkOrderStatus.PENDING,
  })
  status: WorkOrderStatus;

  @Column({ name: 'prepay_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  prepayAmount: number;

  @Column({ name: 'final_payment_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  finalPaymentAmount: number;

  @Column({ name: 'final_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  finalAmount: number;

  @Column({ name: 'dispatch_type', type: 'enum', enum: DispatchType, nullable: true })
  dispatchType: DispatchType;

  @Column({ name: 'designated_engineer_id', nullable: true })
  designatedEngineerId: string;

  @Column({ name: 'customer_confirm', nullable: true })
  customerConfirm: boolean;

  @Column({ name: 'on_site_photos', type: 'json', nullable: true })
  onSitePhotos: string[];

  @Column({ name: 'signature_url', type: 'text', nullable: true })
  signatureUrl: string;

  @Column({ name: 'repair_report', type: 'text', nullable: true })
  repairReport: string;

  @Column({ name: 'refuse_reason', length: 200, nullable: true })
  refuseReason: string;

  @Column({ name: 'reviewed', nullable: true })
  reviewed: boolean;

  @Column({ name: 'estimated_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  estimatedAmount: number;

  @Column({ name: 'parts_fee', type: 'decimal', precision: 10, scale: 2, nullable: true })
  partsFee: number;

  @Column({ name: 'labor_fee', type: 'decimal', precision: 10, scale: 2, nullable: true })
  laborFee: number;

  @Column({ name: 'cs_operator_id', nullable: true })
  csOperatorId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'completed_at', nullable: true })
  completedAt: Date;

  @ManyToOne('Customer', 'workOrders')
  @JoinColumn({ name: 'customer_id' })
  customer: any;

  @ManyToOne('Device', 'workOrders')
  @JoinColumn({ name: 'device_id' })
  device: any;

  @ManyToOne('Engineer', 'workOrders', { nullable: true })
  @JoinColumn({ name: 'engineer_id' })
  engineer: any;

  @ManyToOne('Address', 'workOrders')
  @JoinColumn({ name: 'address_id' })
  address: any;

  @OneToOne('MaintenanceRecord', 'workOrder')
  maintenanceRecord: any;

  @OneToOne('Review', 'workOrder')
  review: any;

  @OneToOne('Complaint', 'workOrder', { nullable: true })
  complaint: any;

  @OneToMany('ServiceChat', 'workOrder')
  serviceChats: any[];

  @OneToMany('DispatchRecord', 'workOrder')
  dispatchRecords: any[];

  @OneToMany('Notification', 'workOrder')
  notifications: any[];
}
