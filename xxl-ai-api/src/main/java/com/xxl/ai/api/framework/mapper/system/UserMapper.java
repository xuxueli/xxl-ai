package com.xxl.ai.api.framework.mapper.system;

import com.xxl.ai.api.framework.model.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/**
 * @author xuxueli 2019-05-04 16:44:59
 */
@Mapper
public interface UserMapper {

	int insert(User xxlJobUser);

	int delete(@Param("id") int id);

	int deleteByIds(@Param("ids") List<Integer> ids);

	int update(User xxlJobUser);

	User loadByUserName(@Param("username") String username);

	User load(@Param("id") int id);

	List<User> loadByIds(@Param("ids") List<Integer> ids);

	List<User> pageList(@Param("offset") int offset,
							   @Param("pagesize") int pagesize,
							   @Param("username") String username,
							   @Param("status") int status);
	int pageListCount(@Param("offset") int offset,
					  @Param("pagesize") int pagesize,
					  @Param("username") String username,
					  @Param("status") int status);


	int updateToken(@Param("id") int id, @Param("token") String token);

}
