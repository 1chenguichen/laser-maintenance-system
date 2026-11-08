import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';

@Entity('material_requests')
export class MaterialRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) number: string;
  @Column() kind: string;
  @Column({ name: 'engineer_id' }) engineerId: string;
  @Column({ name: 'part_id' }) partId: string;
  @Column({ name: 'source_warehouse_id' }) sourceWarehouseId: string;
  @Column({ name: 'target_warehouse_id' }) targetWarehouseId: string;
  @Column({ type: 'int' }) quantity: number;
  @Column({ default: 'PENDING' }) status: string;
  @Column({ type: 'text', default: '' }) note: string;
  @Column({ name: 'review_note', type: 'text', default: '' }) reviewNote: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne('Part') @JoinColumn({ name: 'part_id' }) part: any;
  @ManyToOne('Engineer') @JoinColumn({ name: 'engineer_id' }) engineer: any;
  @ManyToOne('Warehouse') @JoinColumn({ name: 'source_warehouse_id' }) sourceWarehouse: any;
  @ManyToOne('Warehouse') @JoinColumn({ name: 'target_warehouse_id' }) targetWarehouse: any;
}

@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'warehouse_id' }) warehouseId: string;
  @Column({ name: 'part_id' }) partId: string;
  @Column({ name: 'engineer_id', nullable: true }) engineerId: string;
  @Column({ name: 'request_id', nullable: true }) requestId: string;
  @Column({ name: 'work_order_id', nullable: true }) workOrderId: string;
  @Column() action: string;
  @Column({ type: 'int' }) quantity: number;
  @Column({ name: 'unit_cost', type: 'decimal', precision: 12, scale: 2, default: 0 }) unitCost: number;
  @Column({ name: 'actor_id' }) actorId: string;
  @Column({ type: 'text', default: '' }) note: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @ManyToOne('Part') @JoinColumn({ name: 'part_id' }) part: any;
  @ManyToOne('Warehouse') @JoinColumn({ name: 'warehouse_id' }) warehouse: any;
}

@Entity('service_contracts')
export class ServiceContract {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) number: string;
  @Column() title: string;
  @Column({ name: 'customer_id' }) customerId: string;
  @Column({ type: 'date', name: 'start_date' }) startDate: string;
  @Column({ type: 'date', name: 'end_date' }) endDate: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount: number;
  @Column({ default: 'DRAFT' }) status: string;
  @Column({ name: 'labor_included', default: false }) laborIncluded: boolean;
  @Column({ name: 'parts_discount', type: 'decimal', precision: 5, scale: 2, default: 100 }) partsDiscount: number;
  @Column({ name: 'device_ids', type: 'json', default: () => "'[]'" }) deviceIds: string[];
  @Column({ type: 'text', default: '' }) terms: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @ManyToOne('Customer') @JoinColumn({ name: 'customer_id' }) customer: any;
}

@Entity('finance_records')
export class FinanceRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) number: string;
  @Column() kind: string;
  @Column({ name: 'source_type' }) sourceType: string;
  @Column({ name: 'source_id' }) sourceId: string;
  @Column({ name: 'customer_id' }) customerId: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount: number;
  @Column() status: string;
  @Column({ default: '' }) title: string;
  @Column({ name: 'tax_number', default: '' }) taxNumber: string;
  @Column({ name: 'invoice_number', default: '' }) invoiceNumber: string;
  @Column({ type: 'text', default: '' }) note: string;
  @Column({ name: 'actor_id' }) actorId: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @ManyToOne('Customer') @JoinColumn({ name: 'customer_id' }) customer: any;
}
