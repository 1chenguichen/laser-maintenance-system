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

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ length: 20 })
  province: string;

  @Column({ length: 20 })
  city: string;

  @Column({ length: 20 })
  district: string;

  @Column({ length: 200 })
  detail: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ length: 50, nullable: true })
  label: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne('Customer', 'addresses')
  @JoinColumn({ name: 'customer_id' })
  customer: any;

  @OneToMany('WorkOrder', 'address')
  workOrders: any[];
}
