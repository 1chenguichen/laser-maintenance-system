@echo off
chcp 65001 >nul
echo ========================================
echo 激光设备售后维修系统 - 本地停止
echo ========================================
echo.

REM 关闭运行窗口
echo [1/3] 关闭运行窗口...
taskkill /FI "WINDOWTITLE EQ Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE EQ CS-Admin*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE EQ Customer-Web*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE EQ Engineer-Web*" /F >nul 2>&1
echo   完成

REM 停止 Docker 容器
echo [2/3] 停止 Docker 容器...
cd /d %~dp0backend
docker-compose down
cd /d %~dp0

echo [3/3] 清理完成
echo.
echo ========================================
echo 停止完成！
echo ========================================
echo.
echo 如需连同数据一起清除 (会删除数据库卷):
echo   cd backend ^&^& docker-compose down -v
echo.
pause
