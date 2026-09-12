import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ name: 'serial_number', length: 50 })
  serialNumber: string;

  @Column({ length: 100 })
  model: string;

  @Column({ name: 'device_type', length: 50 })
  deviceType: string;

  @Column({ name: 'purchase_date', type: 'date', nullable: true })
  purchaseDate: Date;

  @Column({ name: 'warranty_expire', type: 'date', nullable: true })
  warrantyExpire: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne('Customer', 'devices')
  @JoinColumn({ name: 'customer_id' })
  customer: any;

  @OneToMany('WorkOrder', 'device')
  workOrders: any[];

  @OneToMany('MaintenanceRecord', 'device')
  maintenanceRecords: any[];
}
