import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_order_id' })
  workOrderId: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ name: 'engineer_id' })
  engineerId: string;

  @Column({ type: 'decimal', precision: 2, scale: 1 })
  rating: number;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'varchar', array: true, nullable: true })
  tags: string[];

  @Column({ name: 'is_anonymous', default: false })
  isAnonymous: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToOne('WorkOrder', 'review')
  @JoinColumn({ name: 'work_order_id' })
  workOrder: any;

  @ManyToOne('Customer', 'reviews')
  @JoinColumn({ name: 'customer_id' })
  customer: any;

  @ManyToOne('Engineer', 'reviews')
  @JoinColumn({ name: 'engineer_id' })
  engineer: any;
}
