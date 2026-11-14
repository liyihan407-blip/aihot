package cn.aihot.service;

import cn.aihot.config.AppProperties;
import cn.aihot.model.Models;
import cn.aihot.util.TextTools;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailSender;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import static cn.aihot.model.Models.*;

/** 按邮件配置发送热点提醒。 */
@Service
public class MailService {
    private final AppProperties config;
    private final ObjectProvider<MailSender> senders;
    public MailService(AppProperties config, ObjectProvider<MailSender> senders) { this.config = config; this.senders = senders; }
    public boolean send(Hotspot h) {
        if (!config.mailConfigured() || !h.analysis().mode().equals("ai") || !java.util.Set.of("high", "urgent").contains(h.analysis().importance())) return false;
        try {
            MailSender sender = senders.getIfAvailable();
            if (sender == null) return false;
            var msg = new SimpleMailMessage(); msg.setFrom(config.smtpUser()); msg.setTo(config.notifyEmail());
            msg.setSubject("[AIHot] " + TextTools.truncate(h.article().title(), 100));
            msg.setText(h.analysis().summary() + "\n\n关联说明：" + h.analysis().reason() + "\n\n原文：" + h.article().url() + "\n\nAI 分析仅供参考，请核对原始来源。");
            sender.send(msg); return true;
        } catch (Exception e) { return false; }
    }
}
