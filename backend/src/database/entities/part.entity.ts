import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('parts')
export class Part {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 30, unique: true })
  code: string;

  @Column({ length: 50 })
  category: string;

  @Column({ length: 10 })
  unit: string;

  @Column({ name: 'guide_price', type: 'decimal', precision: 10, scale: 2 })
  guidePrice: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany('PartsInventory', 'part')
  inventoryItems: any[];
}
