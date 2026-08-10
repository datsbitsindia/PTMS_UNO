#!/bin/bash
BACKUP_DIR="/home/ubuntu/db_backups"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y-%m-%d_%H-%M)

# 100% Complete Full Backup for both databases (Compressed .gz)
mysqldump -u root -pBHAVIN467 --single-transaction --routines --triggers taskmanager | gzip > $BACKUP_DIR/taskmanager_$DATE.sql.gz
mysqldump -u root -pBHAVIN467 --single-transaction --routines --triggers ptms_uno | gzip > $BACKUP_DIR/ptms_uno_$DATE.sql.gz

echo "Full Backup Completed Successfully at $DATE"
