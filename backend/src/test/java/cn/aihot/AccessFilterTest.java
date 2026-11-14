package cn.aihot;

import cn.aihot.config.AppProperties;
import cn.aihot.security.AccessFilter;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import static org.junit.jupiter.api.Assertions.*;

class AccessFilterTest {
    private AppProperties props(String token) {
        return new AppProperties("siliconflow","","deepseek","","",false,2,7,5,2,false,token,"",587,"","",false,"","","","");
    }
    @Test void rejectsMissingTokenAndAcceptsExactToken() throws Exception {
        var filter=new AccessFilter(props("test-secret"));
        var req=new MockHttpServletRequest("GET","/api/config");
        var res=new MockHttpServletResponse();var chain=new MockFilterChain();
        filter.doFilter(req,res,chain);
        assertEquals(401,res.getStatus());assertNull(chain.getRequest());
        req=new MockHttpServletRequest("GET","/api/config");req.addHeader("X-AIHot-Token","test-secret");
        res=new MockHttpServletResponse();chain=new MockFilterChain();
        filter.doFilter(req,res,chain);assertNotNull(chain.getRequest());
    }
    @Test void healthEndpointRemainsPublicAndWebsocketRequiresToken() throws Exception {
        var filter=new AccessFilter(props("test-secret"));
        var req=new MockHttpServletRequest("GET","/api/health");var res=new MockHttpServletResponse();var chain=new MockFilterChain();
        filter.doFilter(req,res,chain);assertNotNull(chain.getRequest());
        req=new MockHttpServletRequest("GET","/ws");res=new MockHttpServletResponse();chain=new MockFilterChain();
        filter.doFilter(req,res,chain);assertEquals(401,res.getStatus());
    }
    @Test void decodedServletPathIsProtected() throws Exception {
        var filter=new AccessFilter(props("test-secret"));
        var req=new MockHttpServletRequest("GET","/%61pi/config");req.setServletPath("/api/config");
        var res=new MockHttpServletResponse();filter.doFilter(req,res,new MockFilterChain());assertEquals(401,res.getStatus());
    }
    @Test void foreignBrowserOriginCannotTriggerMutation() throws Exception {
        var filter=new AccessFilter(props(""));
        var req=new MockHttpServletRequest("POST","/api/keywords/demo/scan");
        req.addHeader("Origin","https://other.example");req.addHeader("Host","localhost:8787");
        var res=new MockHttpServletResponse();filter.doFilter(req,res,new MockFilterChain());assertEquals(403,res.getStatus());
    }
}
