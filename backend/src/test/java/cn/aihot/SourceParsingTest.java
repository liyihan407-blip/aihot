package cn.aihot;

import cn.aihot.service.AiService;
import cn.aihot.service.SourceService;
import cn.aihot.config.AppProperties;
import cn.aihot.model.Models;
import cn.aihot.util.TextTools;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SourceParsingTest {
    @Test void parsesRssAndRejectsHtmlChallenges() {
        var props=new AppProperties("siliconflow","","deepseek","","",false,2,7,5,2,false,"","",587,"","",false,"","","","");
        var service=new SourceService(props,new ObjectMapper());
        try {
            var result=service.parseRss("<rss><channel><item><title>A &amp; B</title><link>https://example.com/a</link><description><![CDATA[<b>Hello</b>]]></description><pubDate>Fri, 13 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>","bing");
            assertEquals("A & B",result.getFirst().title());assertEquals("Hello",result.getFirst().content());assertEquals("2026-11-13T08:00:00Z",result.getFirst().publishedAt());
            assertThrows(IllegalStateException.class,()->service.parseRss("<html>captcha</html>","bing"));
        } finally {service.close();}
    }
    @Test void canonicalizationPreservesMeaningfulQueriesAndDropsTrackers() {
        assertEquals("https://example.com/a?id=2",TextTools.canonicalUrl("https://www.example.com/a/?utm_source=feed&id=2#intro"));
        assertEquals("",TextTools.canonicalUrl("javascript:alert(1)"));
        assertNotEquals(TextTools.canonicalUrl("https://example.com/?id=1"),TextTools.canonicalUrl("https://example.com/?id=2"));
    }
    @Test void localFallbackClearlyMarksItsLimitations() {
        var article=new Models.Article("github","Claude tools","https://example.com","Claude SDK",null,0,0,0,"");
        var result=AiService.fallback(article,"Claude",java.util.List.of("Claude"),"degraded");
        assertEquals("degraded",result.mode());assertEquals(35,result.confidence());assertTrue(result.reason().contains("未进行事实核验"));
    }
}
