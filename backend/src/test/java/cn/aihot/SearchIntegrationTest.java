package cn.aihot;

import cn.aihot.service.AiService;
import cn.aihot.service.SearchService;
import cn.aihot.service.SourceService;
import cn.aihot.service.MailService;
import cn.aihot.repository.HotspotRepository;
import cn.aihot.model.Models;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.util.*;
import static cn.aihot.model.Models.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.config.import=", "spring.datasource.url=jdbc:h2:mem:aihot;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
    "spring.datasource.username=sa","spring.datasource.password=","aihot.scheduler-enabled=false","aihot.legacy-import=false",
    "aihot.siliconflow-api-key=","aihot.openrouter-api-key=","aihot.max-analysis-per-run=2","aihot.api-token="})
@AutoConfigureMockMvc
class SearchIntegrationTest {
    @Autowired MockMvc mvc; @Autowired JdbcTemplate db; @Autowired HotspotRepository repo;
    @MockitoBean SourceService sources; @MockitoBean AiService ai; @MockitoBean MailService mail;
    Analysis accept = new Analysis(true,false,85,78,true,"high","相关内容摘要","直接讨论查询主题","ai","test");
    @BeforeEach void setup() {
        for(String table:List.of("keyword_hotspots","notifications","judgments","hotspots","keywords","source_health","job_runs"))db.update("DELETE FROM "+table);
        reset(sources,ai,mail);
        when(ai.expand(anyString(),anyBoolean())).thenAnswer(i->List.of((String)i.getArgument(0)));
        when(ai.analyze(any(),anyString(),anyList(),anyBoolean())).thenReturn(accept);
        fixture(List.of(article("one")));
    }
    Article article(String suffix) {return new Article("github","Claude "+suffix,"https://example.com/"+suffix,"Claude development",now(),12,100,2,"tester");}
    void fixture(List<Article> items) {when(sources.collect(anyString(),anyList(),anyList())).thenReturn(List.of(new SourceResult("github","ok",items.size(),20,"",items)));}
    void search(String query) throws Exception {mvc.perform(post("/api/search").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\""+query+"\",\"sources\":[\"github\"]}")).andExpect(status().isOk());}
    @Test void validatesRequests() throws Exception {
        mvc.perform(post("/api/search").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"   \"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/search").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"Claude\",\"sources\":[\"unknown\"]}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/hotspots?size=0")).andExpect(status().isBadRequest());
    }
    @Test void manualSearchUsesTheRequestModelWithoutReturningItsKey() throws Exception {
        var session = new AiService.Session(mock(org.springframework.ai.openai.OpenAiChatModel.class), "test-fingerprint");
        when(ai.createSession(any())).thenReturn(session);
        when(ai.expand(anyString(), anyBoolean(), eq(session))).thenReturn(List.of("Claude"));
        when(ai.analyze(any(), anyString(), anyList(), anyBoolean(), eq(session))).thenReturn(accept);
        String request = """
            {"query":"Claude","sources":["github"],"useAi":true,
             "customAi":{"baseUrl":"https://api.openai.com/v1","model":"example-model","apiKey":"test-key-never-return"}}
            """;
        mvc.perform(post("/api/search").contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("ai"))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("test-key-never-return"))));
        verify(ai).createSession(argThat(value -> value.model().equals("example-model")));
        verify(ai).analyze(any(), anyString(), anyList(), eq(true), eq(session));
    }
    @Test void countsRejectedAnalysisAgainstBudgetAndCachesIt() throws Exception {
        fixture(java.util.stream.IntStream.range(0,6).mapToObj(i->article(""+i)).toList());
        when(ai.analyze(any(),anyString(),anyList(),anyBoolean())).thenReturn(new Analysis(false,false,12,90,false,"low","","不相关","ai","test"));
        mvc.perform(post("/api/search").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"Claude\",\"sources\":[\"github\"]}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.analyzed").value(2)).andExpect(jsonPath("$.filtered").value(2)).andExpect(jsonPath("$.deferred").value(4));
        search("Claude");
        verify(ai,times(4)).analyze(any(),anyString(),anyList(),anyBoolean());
        Assertions.assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM judgments",Integer.class));
    }
    @Test void savesDeduplicatedHistoryAndSupportsBookmarks() throws Exception {
        var a=article("one");fixture(List.of(a,new Article("bing",a.title(),a.url()+"/?utm_source=test",a.content(),a.publishedAt(),0,0,0,"")));
        search("Claude");
        Assertions.assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM hotspots",Integer.class));
        String id=db.queryForObject("SELECT id FROM hotspots",String.class);
        mvc.perform(patch("/api/hotspots/"+id+"/bookmark").contentType(MediaType.APPLICATION_JSON).content("{\"bookmarked\":true}")).andExpect(status().isOk());
        mvc.perform(get("/api/hotspots?bookmarked=true")).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].bookmarked").value(true));
        mvc.perform(get("/api/hotspots?q=unrelated")).andExpect(jsonPath("$.total").value(0));
        search("Claude");verify(ai,times(1)).analyze(any(),anyString(),anyList(),anyBoolean());
    }
    @Test void sameArticleCanBelongToMultipleMonitorsWithoutRepeatedNotifications() throws Exception {
        var a=repo.saveKeyword("Claude",true,30);var b=repo.saveKeyword("Claude Code",true,60);
        mvc.perform(post("/api/keywords/"+a.id()+"/scan")).andExpect(status().isOk());
        mvc.perform(post("/api/keywords/"+a.id()+"/scan")).andExpect(status().isOk());
        mvc.perform(post("/api/keywords/"+b.id()+"/scan")).andExpect(status().isOk());
        Assertions.assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM hotspots",Integer.class));
        Assertions.assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM keyword_hotspots",Integer.class));
        Assertions.assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM notifications",Integer.class));
        mvc.perform(get("/api/hotspots?keywordId="+b.id())).andExpect(jsonPath("$.items[0].query").value("Claude Code"));
        mvc.perform(patch("/api/notifications/all/read")).andExpect(status().isOk());
        mvc.perform(get("/api/notifications")).andExpect(jsonPath("$.unread").value(0));
        mvc.perform(delete("/api/keywords/"+a.id())).andExpect(status().isOk());
        Assertions.assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM hotspots",Integer.class));
    }
    @Test void ruleFallbackNeverCreatesAutomaticNotifications() throws Exception {
        when(ai.analyze(any(),anyString(),anyList(),anyBoolean())).thenReturn(new Analysis(true,false,70,35,true,"low","规则匹配","未事实核验","rules","local"));
        var k=repo.saveKeyword("Claude",true,30);
        mvc.perform(post("/api/keywords/"+k.id()+"/scan")).andExpect(status().isOk());
        Assertions.assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM notifications",Integer.class));
        verify(mail,never()).send(any());
    }
    @Test void partialSourceFailureIsVisibleAndDoesNotAbortSuccessfulSources() throws Exception {
        when(sources.collect(anyString(),anyList(),anyList())).thenReturn(List.of(new SourceResult("github","ok",1,12,"",List.of(article("one"))),new SourceResult("bing","error",0,12000,"来源请求超时",List.of())));
        mvc.perform(post("/api/search").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"Claude\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.sources[1].status").value("error"));
        Assertions.assertEquals("partial",db.queryForObject("SELECT status FROM job_runs",String.class));
    }
    @Test void rejectedAndMalformedModelResultsDoNotBecomeAccepted() {
        Assertions.assertFalse(SearchService.accepted(new Analysis(true,true,99,99,true,"high","","","ai","test")));
        Assertions.assertFalse(SearchService.accepted(new Analysis(true,false,60,80,false,"high","","","ai","test")));
    }
}
