import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('after_sales')
export class AfterSales {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ name: 'device_id', nullable: true })
  deviceId: string;

  @Column({ name: 'serial_number', length: 50, nullable: true })
  serialNumber: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ length: 200, nullable: true })
  solution: string;

  @Column({ name: 'cs_operator_id', nullable: true })
  csOperatorId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne('Customer', 'afterSales')
  @JoinColumn({ name: 'customer_id' })
  customer: any;
}
