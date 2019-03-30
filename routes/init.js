const sql_query = require('../sql');
const passport = require('passport');
const bcrypt = require('bcrypt')

// Postgre SQL Connection
const { Pool } = require('pg');
const pool = new Pool({
	connectionString: process.env.DATABASE_URL
});

const round = 10;
const salt  = bcrypt.genSaltSync(round);

const infinity = 2147483647;

var ranges = ["≤1000", "1000-2000", "2000-3000", "≥3000"];
var rangeNum = [[0, 1000], [1000, 2000], [2000, 3000], [3000, infinity]];
var dateRanges = ["last 3 days", "last one week", "last one month(30 days)"];

function initRouter(app) {
    console.log("connecting to the database: " + process.env.DATABASE_URL);

	/* GET */
    app.get('/', index);
    app.get('/signup', signup);
    app.get('/login', login);
    app.get('/tasks/search', tasks_search);
    app.get('/tasks', tasks)
    app.get('/post', post);

    /* Protected GET */
    app.get('/profile', passport.authMiddleware(), profile);
    app.get('/admin_users', admin_users);

    /* Post Tasks */
    app.post('/receive_post', receive_post);

    /* Sign Up */
    app.post('/receive_signup', receive_signup);

    /* Login */
    app.post('/receive_login', receive_login);

    /* Logout */
    app.get('/logout', passport.authMiddleware(), logout);

}

/* Basic Info used for profile. */
function basic(req, res, page, other) {
  var info = {
    page: page,
    rname: req.body.rname,
    gender : req.body.gender,
  };
  if(other) {
    for(var fld in other) {
      info[fld] = other[fld];
    }
  }
  res.render(page, info);
}

function query(req, fld) {
  return req.query[fld] ? req.query[fld] : '';
}
function msg(req, fld, pass, fail) {
  var info = query(req, fld);
  return info ? (info=='pass' ? pass : fail) : '';
}

/* User can view and update his own profile page. */
function profile(req, res, next) {
  basic(req, res, 'profile', { info_msg: msg(req, 'info', 'Information updated'
        + ' successfully', 'Error in updating information'),
    pass_msg: msg(req, 'pass', 'Password updated successfully', 'Error in updating password'), auth: true });

}

/* Admin can view all the users. */
function admin_users(req, res, next) {
    pool.query(sql_query.query.admin_view_users, (err, data) => {
        if (err) {
            console.log("Error encountered when admin trying to view all"
                + " users.");
        } else {
            res.render('admin_users', {title: "admin_users", types: data.rows });
      }
    })
}

function index(req, res, next) {
    pool.query(sql_query.query.get_task_type, (err, data) => {
        if(err) {
            console.log("Error encountered when reading classifications");
        } else {
            if(!req.isAuthenticated()) {
                console.log("not authenticated yet.");
            	res.render('index', { title: 'HomePage' , page: '', auth: false, types: data.rows});
            } else {
            	console.log(req.user.username + " has logged in!");
            	basic(req, res, 'index', { title: 'Homepage', page: '', auth: true, types: data.rows});
            }
        }
    })
}

function tasks_search(req, res, next) {
    var keyword = "%" + req.query.keyword + "%";
    console.log(keyword);
    pool.query(sql_query.query.search, [keyword], (err, data) => {
        if(err) {
            console.log("Error encountered when searching");
            index(req, res, next);
        } else {
            show(res, data);
        }
    });
}

function tasks(req, res, next) {
    var type = req.query.type === "" || typeof req.query.type === "undefined" ? sql_query.query.get_task_type : req.query.type;
    var region = req.query.region === "" || typeof req.query.region === "undefined"  ? sql_query.query.get_region : req.query.region;
    var date = req.query.date === "" || typeof req.query.date === "undefined"  ? sql_query.query.get_all_date : getDate(req.query.date);
    var range = req.query.range === "" || typeof req.query.range === "undefined"  ? [0, infinity] : rangeNum[ranges.indexOf(req.query.range)];
    console.log("tasks: " + type + "-" + region + "-" + range + "-" + date);
    pool.query(sql_query.query.search, ["%%"], (err, data) => {
        if(err) {
            console.log("Error encountered when searching");
            index(req, res, next);
        } else {
            pool.query(sql_query.query.filter, [type, region, date, range[0], range[1]], (err, data) => {
                if(err) {
                    console.log("Error encountered when filtering");
                    index(req, res, next);
                } else {
                    show(res, data, req.query.type , req.query.region, req.query.date, req.query.range);
                }
            });
        }
    });
}

function getDate(choice) {
    var resultDate = new Date();
    switch (choice) {
    case dateRanges[0]:
        resultDate = new Date(resultDate.setDate(resultDate.getDate()-3));
        break;
    case dateRanges[1]:
        resultDate = new Date(resultDate.setDate(resultDate.getDate()-7));
        break;
    case dateRanges[2]:
        resultDate = new Date(resultDate.setDate(resultDate.getDate()-30));
        break;
    }
    return resultDate.getUTCFullYear() + "-" + resultDate.getUTCMonth() + "-" + resultDate.getUTCDate();
}

function show(res, data1, selectedType, selectedRegion, selectedDate, selectedRange) {
    var selectedType = selectedType === "" || typeof selectedType === "undefined" ? "Type" : selectedType;
    var selectedRegion = selectedRegion === "" || typeof selectedRegion === "undefined" ? "Region" : selectedRegion;
    var selectedDate = selectedDate === "" || typeof selectedDate === "undefined" ? "Date" : selectedDate;
    var selectedRange = selectedRange === "" || typeof selectedRange === "undefined" ? "Salary" : selectedRange;
    console.log("show: " + selectedType + "-" + selectedRegion + "-" + selectedDate + "-" + selectedRange);
    pool.query(sql_query.query.get_task_type, (err, data2) => {
        if(err) {
            console.log("Error encountered when reading classifications");
        } else {
            pool.query(sql_query.query.get_region, (err, data3) => {
                if(err) {
                    console.log("Error encountered when reading regions");
                } else {
                    res.render('tasks', { title: "Search Results",
                        tasks: data1.rows, type: selectedType, region: selectedRegion, taskDate: selectedDate, range: selectedRange,
                        types: data2.rows, regions: data3.rows, dates: dateRanges, ranges: ranges });
                }
            });
        }
    });
}

function login(req, res, next) {
    res.render('login', { title: 'LogIn', auth: false});
}

function signup(req, res, next) {
    pool.query(sql_query.query.get_region, (err, data) => {
        res.render('signup', { title: 'SignUp' , regionData: data.rows, auth: false});
    });
}

// POST
function update_info(req, res, next) {
  var aid = req.body.rname;
  var rname  = req.body.rname;
  var gender = req.body.gender;
  pool.query(sql_query.query.update_info, [aid, rname, gender], (err, data) => {
    console.log("---aid: " + aid +" ---rname: " + rname + " ---gender: " + gender);
    if(err) {
      console.error("Error in update info");
      res.redirect('/profile');
    } else {
      res.redirect('/profile');
}
});
}

function receive_signup(req, res, next) {
    //add sign up information into the database
    var aid;
    pool.query(sql_query.query.get_user_num, (err, data) => {
        if(err){
            console.log("cannot read the number");
            res.redirect('/');
        }else{
            aid = parseInt(data.rows[0].num, 10);
            var email = req.body.email;
            var username = req.body.username;
            var region = req.body.region;
            var password = req.body.password;
            var password_confirm = req.body.password_confirm;

            if (password.localeCompare(password_confirm) != 0) {
                //if the password and the confirmed password not match
                //reload the sign up page
                console.error("passwords not match");
                signup(req, res, next);
            } else {
                password = bcrypt.hashSync(password, salt);
                pool.query(sql_query.query.add_account, [aid, email, username, password], (err, data) => {
                    if(err) {
                        console.error("Cannot add the account");
                        res.redirect('/');
                    } else {
                        pool.query(sql_query.query.add_user, [aid, region], (err, data) => {
                            if(err) {
                                console.error("Cannot add the user");
                                res.redirect('/');
                            } else {
                                res.redirect('/login');
                            }
                        });
                    }
                });
            }
        }
    });

}


function receive_login(req, res, next){
    passport.authenticate('local', function(err, user, info) {
        if (err) {
            return next(err);
        }

        if (!user) {
            return res.redirect('/login');
        }

        req.logIn(user, function(err) {
            if (err) {
                return next(err);
            }
            return res.redirect('/?user=' + user.username);
        });
    })(req, res, next);
}

function profile(req, res, next){
    res.render('profile', {user: req.user.username, auth: true});
}

function logout(req, res, next){
    req.session.destroy()
    req.logout()
    res.redirect('/')
}

function post(req, res, next) {
    pool.query(sql_query.query.get_task_type, (err, data1) => {
        if(err) {
            console.log("Error encountered when reading classifications");
        } else {
          pool.query(sql_query.query.get_region_name, (err, data2) => {
						if (err){
							console.log("Error encountered when reading regions");
						} else {
							res.render('post', { title:"Post New Task", types: data1.rows, regions:data2.rows });
						}
					})
        }
    })
}

function receive_post(req, res, next) {
	//add new task into the database
	var tid;
	pool.query(sql_query.query.get_task_num, (err, data) => {
		if(err){
			console.log("cannot read task number");
			res.redirect('/');
		} else {
			tid = parseInt(data.rows[0].num, 10) + 1;
			var title = req.body.title;
			var rname = req.body.region;
			var cname = req.body.type;
			var finder_id = 1; //to be updated with the user id from the session
			var salary = parseInt(req.body.salary);
			var desc = req.body.desc;
			var date = new Date(req.body.date);

			var today = new Date()
			var today_date = today.getUTCFullYear() + "-" + (today.getUTCMonth() + 1) + "-" + today.getUTCDate();

			if (date < today) {
				console.error("This date has already passed.");
				post(req, res, next);
			} else {
				var datestring = date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1) + "-" + date.getUTCDate();
				pool.query(sql_query.query.add_task, [tid, title, rname, cname, finder_id, salary, today_date, datestring, desc], (err, data) => {
					if(err) {
						console.error("Cannot add the task");
						res.redirect('/');
					} else {
						res.redirect('/');
					}
				});
			}
		}
	})

}

module.exports = initRouter;
