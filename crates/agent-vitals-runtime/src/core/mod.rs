//! 平台原语（crate 根，无领域归属，被所有子目录依赖）。

pub mod clock;
pub mod home;
pub mod logging;
pub mod retention;
pub mod state;
pub mod statistics_timezone;
pub mod takeover;
