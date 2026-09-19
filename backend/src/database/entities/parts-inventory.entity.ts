import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('parts_inventory')
export class PartsInventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'warehouse_id' })
  warehouseId: string;

  @Column({ name: 'part_id' })
  partId: string;

  @Column({ default: 0 })
  quantity: number;

  @Column({ name: 'reserved_quantity', default: 0 })
  reservedQuantity: number;

  @Column({ name: 'restock_date', type: 'date', nullable: true })
  restockDate: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne('Warehouse', 'inventoryItems')
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: any;

  @ManyToOne('Part', 'inventoryItems')
  @JoinColumn({ name: 'part_id' })
  part: any;
}
