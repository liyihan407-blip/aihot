-- 用 MySQL 管理员账号执行一次。Java 启动后自动创建业务表，不会删除现有数据。
CREATE DATABASE IF NOT EXISTS aihot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- 推荐创建独立业务账号。请先把密码示例换成你自己的强密码，再取消下面三行的注释。
-- CREATE USER IF NOT EXISTS 'aihot'@'localhost' IDENTIFIED BY '请换成你的强密码';
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES ON aihot.* TO 'aihot'@'localhost';
-- FLUSH PRIVILEGES;
-- 若 Java 在另一台机器上，账号允许的主机名需按实际部署修改；不要直接暴露 MySQL 到公网。
