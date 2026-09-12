import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
} from 'typeorm';

@Entity('engineer_monthly_stats')
@Unique(['engineerId', 'statYear', 'statMonth'])
export class EngineerMonthlyStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'engineer_id' })
  engineerId: string;

  @Column({ name: 'stat_year' })
  statYear: number;

  @Column({ name: 'stat_month' })
  statMonth: number;

  @Column({ name: 'order_count', default: 0 })
  orderCount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  revenue: number;

  @Column({ name: 'avg_rating', type: 'decimal', precision: 3, scale: 2, nullable: true })
  avgRating: number;
}
