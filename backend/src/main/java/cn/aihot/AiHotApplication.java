package cn.aihot;

import cn.aihot.config.AppProperties;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 启动 Spring Boot 应用，并启用定时任务与配置绑定。 */
@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(AppProperties.class)
public class AiHotApplication {
    public static void main(String[] args) { SpringApplication.run(AiHotApplication.class, args); }
}
