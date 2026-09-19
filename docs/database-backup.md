# 数据库备份策略

## 概述

本系统使用 PostgreSQL 作为主数据库，以下是完整的备份与恢复方案。

---

## 备份策略

### 备份类型

| 类型 | 频率 | 保留时间 | 触发时间 |
|------|------|----------|----------|
| 全量备份 | 每日 | 30 天 | 每天凌晨 2:00 |
| 增量备份（ WAL） | 每 15 分钟 | 7 天 | 持续归档 |
| 手动快照 | 按需 | 90 天 | 重要操作前 |

### 备份脚本

```bash
#!/bin/bash
# backup.sh - PostgreSQL 数据库备份脚本

set -e

# 配置
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-laser_user}"
PG_DATABASE="${PG_DATABASE:-laser_maintenance}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres/laser-maintenance}"
DATE=$(date +%Y%m%d)
TIME=$(date +%H%M%S)
RETENTION_DAYS=30

# 创建备份目录
mkdir -p "${BACKUP_DIR}"

# 全量备份函数
backup_full() {
    local filename="${BACKUP_DIR}/full_${DATE}_${TIME}.sql.gz"
    echo "[$(date)] 开始全量备份: ${filename}"
    
    pg_dump -h "${PG_HOST}" \
            -p "${PG_PORT}" \
            -U "${PG_USER}" \
            -d "${PG_DATABASE}" \
            -Fc \
            -Z 6 \
            -f "${filename}"
    
    echo "[$(date)] 全量备份完成: ${filename}"
    echo "[$(date)] 文件大小: $(du -h ${filename} | cut -f1)"
}

# 清理过期备份
cleanup_old() {
    echo "[$(date)] 清理超过 ${RETENTION_DAYS} 天的备份..."
    find "${BACKUP_DIR}" -name "full_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
    echo "[$(date)] 清理完成"
}

# 执行备份
backup_full
cleanup_old

echo "[$(date)] 备份任务完成"
```

### 恢复脚本

```bash
#!/bin/bash
# restore.sh - PostgreSQL 数据库恢复脚本

set -e

if [ -z "$1" ]; then
    echo "用法: $0 <备份文件路径>"
    exit 1
fi

BACKUP_FILE="$1"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-laser_user}"
PG_DATABASE="${PG_DATABASE:-laser_maintenance}"

echo "[$(date)] 开始恢复数据库: ${PG_DATABASE}"
echo "[$(date)] 使用备份文件: ${BACKUP_FILE}"

# 终止现有连接
psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -c "
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE datname = '${PG_DATABASE}' AND pid <> pg_backend_pid();
"

# 删除并重建数据库
psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -c "DROP DATABASE IF EXISTS ${PG_DATABASE};"
psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -c "CREATE DATABASE ${PG_DATABASE};"

# 恢复数据
pg_restore -h "${PG_HOST}" \
           -p "${PG_PORT}" \
           -U "${PG_USER}" \
           -d "${PG_DATABASE}" \
           --clean \
           --if-exists \
           "${BACKUP_FILE}"

echo "[$(date)] 恢复完成"
```

### 定时任务配置 (crontab)

```cron
# 每天凌晨 2:00 执行全量备份
0 2 * * * /opt/scripts/backup.sh >> /var/log/postgres/backup.log 2>&1

# 每天凌晨 3:00 清理过期备份
0 3 * * * find /var/backups/postgres/laser-maintenance -name "full_*.sql.gz" -mtime +30 -delete
```

---

## Docker 环境备份

如果使用 Docker 部署：

```bash
# 全量备份
docker exec laser_postgres pg_dump -U laser_user laser_maintenance | gzip > backup_$(date +%Y%m%d).sql.gz

# 从备份恢复
gunzip -c backup_20240101.sql.gz | docker exec -i laser_postgres psql -U laser_user laser_maintenance
```

---

## 备份验证

每次备份后执行验证：

```bash
# 验证备份文件完整性
gunzip -t backup_file.sql.gz

# 恢复到测试数据库验证
gunzip -c backup_file.sql.gz | psql -h test-host -U laser_user test_database
```

---

## 恢复演练计划

每季度进行一次完整的恢复演练：

1. 在测试环境恢复最新备份
2. 验证数据完整性（表数量、行数、关键业务数据）
3. 验证应用功能正常
4. 记录演练结果

---

## 云端备份（可选）

生产环境建议开启：
- 阿里云 RDS 自动备份
- 备份保留 7-30 天
- 开启跨区域备份
