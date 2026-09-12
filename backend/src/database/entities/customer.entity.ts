import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 20, unique: true })
  phone: string;

  @Column({ name: 'avatar_url', length: 255, nullable: true })
  avatarUrl: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations as strings
  @OneToMany('Address', 'customer')
  addresses: any[];

  @OneToMany('Device', 'customer')
  devices: any[];

  @OneToMany('WorkOrder', 'customer')
  workOrders: any[];

  @OneToMany('Review', 'customer')
  reviews: any[];

  @OneToMany('Complaint', 'customer')
  complaints: any[];

  @OneToMany('AfterSales', 'customer')
  afterSales: any[];

  @OneToMany('ServiceChat', 'customer')
  serviceChats: any[];
}
